import { Injectable, Logger } from "@nestjs/common";
import { convertCents } from "@fove/shared";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { badRequest, forbidden, notFound } from "../common/errors";
import { hmacSha256, safeEqual } from "../common/crypto";
import { loadConfig } from "../config";
import { EmailService } from "../notifications/email.service";
import { OfflineBillingService, formatDay, formatMoney } from "../billing/offline.service";
import { PricingService } from "../billing/pricing.service";
import { collectionConfirmMessage } from "../i18n/offline-emails";
import { tenantLocale } from "../i18n/locale";
import { PartnersService } from "./partners.service";

/** Frais d'encaissement versés au partenaire qui encaisse un renouvellement ou le client d'un autre. */
export const COLLECTION_FEE_PERCENT = 5;
/** Un relevé impayé depuis ce nombre de jours après son émission bloque les nouveaux encaissements. */
export const STATEMENT_BLOCK_DAYS = 30;
const DAY = 86_400_000;

export type CollectionMethod = "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER";

/**
 * Encaissement hors ligne par les partenaires (docs/chantier-encaissement-hors-ligne.md, 6 et 8) :
 * tout partenaire validé encaisse une facture par sa référence, ou la souscription et le renouvellement
 * de ses propres clients ; l'abonnement est activé tout de suite. Garde-fous : plafond d'encours,
 * relevé impayé, encaissement désactivable par l'admin, confirmation au commerçant avec signalement.
 */
@Injectable()
export class CollectionService {
  private readonly logger = new Logger("Collection");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly pricing: PricingService,
    private readonly offline: OfflineBillingService,
    private readonly partners: PartnersService,
  ) {}

  /** Encours dû à FOVE (en centimes d'euro) : encaissements pas encore relevés et soldes de relevés impayés. */
  async outstandingEur(partnerId: string): Promise<number> {
    const db = this.prisma.client;
    const [payments, statements, rates] = await Promise.all([
      db.payment.findMany({ where: { collectorPartnerId: partnerId, statementId: null, status: "SUCCEEDED" }, select: { amountCents: true, currency: true } }),
      db.partnerStatement.findMany({ where: { partnerId, status: "ISSUED" }, select: { balanceCents: true, paidCents: true, currency: true } }),
      this.pricing.rates(),
    ]);
    const toEur = (cents: number, currency: string) => convertCents(cents, currency, "EUR", rates) ?? 0;
    return payments.reduce((s, p) => s + toEur(p.amountCents, p.currency), 0) + statements.reduce((s, st) => s + Math.max(0, toEur(st.balanceCents - st.paidCents, st.currency)), 0);
  }

  /** État de l'encaissement d'un partenaire, et raison d'un blocage éventuel. */
  async status(partnerId: string) {
    const partner = await this.prisma.client.partner.findUniqueOrThrow({ where: { id: partnerId } });
    const outstandingEurCents = await this.outstandingEur(partnerId);
    const overdue = await this.prisma.client.partnerStatement.findFirst({
      where: { partnerId, status: "ISSUED", createdAt: { lt: new Date(Date.now() - STATEMENT_BLOCK_DAYS * DAY) } },
      select: { reference: true },
    });
    const approved = partner.status === "APPROVED" || partner.status === "ACTIVE";
    const blocked: "not_approved" | "disabled" | "overdue" | "cap" | null = !approved
      ? "not_approved"
      : !partner.collectionEnabled
        ? "disabled"
        : overdue
          ? "overdue"
          : outstandingEurCents >= partner.collectionCapEurCents
            ? "cap"
            : null;
    return { enabled: partner.collectionEnabled, capEurCents: partner.collectionCapEurCents, outstandingEurCents, overdueReference: overdue?.reference ?? null, blocked, feePercent: COLLECTION_FEE_PERCENT };
  }

  private async assertCanCollect(partnerId: string, amountCents: number, currency: string) {
    const s = await this.status(partnerId);
    if (s.blocked === "not_approved") throw forbidden("Votre compte partenaire n’est pas encore validé.");
    if (s.blocked === "disabled") throw badRequest("collection_disabled", "L’encaissement est désactivé pour votre compte : contactez FOVE.");
    if (s.blocked === "overdue") throw badRequest("statement_overdue", `Relevé ${s.overdueReference} impayé : réglez-le pour encaisser à nouveau.`);
    const eur = convertCents(amountCents, currency, "EUR", await this.pricing.rates()) ?? 0;
    if (s.outstandingEurCents + eur > s.capEurCents) {
      throw badRequest("collection_cap", "Plafond d’encours atteint : reversez vos encaissements à FOVE (relevé mensuel) pour encaisser à nouveau.");
    }
  }

  /** Facture en attente retrouvée par sa référence : ce que le partenaire doit encaisser. */
  async lookup(userId: string, reference: string) {
    await this.partners.getPartnerByUserId(userId);
    const invoice = await this.offline.findByReference(reference);
    if (!invoice || invoice.status !== "OPEN") throw notFound("Référence");
    const meta = invoice.metadata as { planCode?: string; kind?: string } | null;
    const plan = meta?.planCode ? await this.prisma.client.subscriptionPlan.findUnique({ where: { code: meta.planCode }, select: { name: true } }) : null;
    return {
      reference: invoice.paymentReference,
      tenantName: invoice.tenant.name,
      planName: plan?.name ?? meta?.planCode ?? "",
      kind: meta?.kind ?? "new",
      amountCents: invoice.amountDueCents,
      currency: invoice.currency,
    };
  }

  /**
   * Encaissement validé par le partenaire : il a reçu le montant exact. Abonnement activé, frais
   * d'encaissement (sauf première souscription de son propre client : commission d'apport), email
   * de confirmation au commerçant avec un lien pour signaler un problème.
   */
  async collect(userId: string, input: { reference: string; receiptNumber?: string | null; method?: CollectionMethod }) {
    const partner = await this.partners.getPartnerByUserId(userId);
    const invoice = await this.offline.findByReference(input.reference);
    if (!invoice || invoice.status !== "OPEN") throw notFound("Référence");
    await this.assertCanCollect(partner.id, invoice.amountDueCents, invoice.currency);

    const { payment, periodEnd, plan } = await this.offline.validate(
      invoice.id,
      { method: input.method ?? "CASH", amountCents: invoice.amountDueCents, receiptNumber: input.receiptNumber ?? null, collectorPartnerId: partner.id, note: `Encaissé par le partenaire ${partner.code}` },
      { partnerId: partner.id, email: partner.email },
    );

    // Frais d'encaissement : renouvellement, ou client venu seul ou par un autre partenaire.
    const meta = invoice.metadata as { kind?: string } | null;
    const attribution = await this.prisma.client.acquisitionAttribution.findUnique({ where: { tenantId: invoice.tenantId }, select: { partnerId: true } });
    const ownFirstSubscription = meta?.kind !== "renewal" && attribution?.partnerId === partner.id;
    if (!ownFirstSubscription && payment.amountCents > 0) {
      await this.prisma.client.partnerCommission.create({
        data: {
          partnerId: partner.id,
          tenantId: invoice.tenantId,
          paymentId: payment.id,
          invoiceId: invoice.id,
          kind: "COLLECTION_FEE",
          amountBaseCents: payment.amountCents,
          commissionRatePercent: COLLECTION_FEE_PERCENT,
          commissionAmountCents: Math.round((payment.amountCents * COLLECTION_FEE_PERCENT) / 100),
          currency: payment.currency,
          // Compensés dans le relevé mensuel du partenaire, sans délai de validation.
          status: "CONFIRMED",
          availableAt: new Date(),
        },
      });
    }
    await this.audit.log({ tenantId: invoice.tenantId, action: "billing.collected_by_partner", targetType: "payment", targetId: payment.id, metadata: { partner: partner.code, reference: invoice.paymentReference, amountCents: payment.amountCents, currency: payment.currency, receipt: input.receiptNumber ?? null } });
    await this.sendConfirmation(invoice.tenantId, { paymentId: payment.id, amountCents: payment.amountCents, currency: payment.currency, partnerName: partner.company || partner.name, plan: plan.name, periodEnd });
    return { reference: invoice.paymentReference, tenantName: invoice.tenant.name, amountCents: payment.amountCents, currency: payment.currency, periodEnd };
  }

  /**
   * Souscription ou renouvellement d'un client du partenaire : facture créée (sans accès provisoire
   * ni email d'instructions), à encaisser ensuite par sa référence.
   */
  async invoiceForClient(userId: string, tenantId: string, planCode: string) {
    const partner = await this.partners.getPartnerByUserId(userId);
    const attribution = await this.prisma.client.acquisitionAttribution.findUnique({ where: { tenantId }, select: { partnerId: true } });
    if (attribution?.partnerId !== partner.id) throw forbidden("Ce commerce n’est pas l’un de vos clients : encaissez avec la référence qu’il vous montre.");
    const { invoice } = await this.offline.request(tenantId, planCode, { withProvisional: false, silent: true });
    return this.lookup(userId, invoice.paymentReference!);
  }

  /** Clients du partenaire avec leur abonnement et leur échéance (liste « Clients »). */
  async clients(userId: string) {
    const partner = await this.partners.getPartnerByUserId(userId);
    const attributions = await this.prisma.client.acquisitionAttribution.findMany({
      where: { partnerId: partner.id },
      include: { tenant: { select: { id: true, name: true, settings: { select: { country: true, billingCurrency: true } }, subscription: { select: { status: true, provider: true, currentPeriodEnd: true, provisionalUntil: true, plan: { select: { code: true, name: true, kind: true } } } } } } },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      attributions.map(async (a) => {
        const sub = a.tenant.subscription;
        const paid = sub && sub.plan.kind !== "FREE" && sub.status !== "CANCELED" && sub.provisionalUntil === null && (!sub.currentPeriodEnd || sub.currentPeriodEnd > new Date());
        return {
          tenantId: a.tenant.id,
          name: a.tenant.name,
          planCode: paid ? sub!.plan.code : "free",
          planName: paid ? sub!.plan.name : null,
          provider: paid ? sub!.provider : null,
          periodEnd: paid ? sub!.currentPeriodEnd : null,
          currency: await this.pricing.tenantCurrency(a.tenant.id),
        };
      }),
    );
  }

  /** Historique des encaissements du partenaire. */
  async history(userId: string) {
    const partner = await this.partners.getPartnerByUserId(userId);
    const payments = await this.prisma.client.payment.findMany({
      where: { collectorPartnerId: partner.id },
      include: { tenant: { select: { name: true } }, invoice: { select: { paymentReference: true } }, statement: { select: { reference: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return payments.map((p) => ({
      id: p.id,
      date: p.confirmedAt ?? p.createdAt,
      tenantName: p.tenant.name,
      reference: p.invoice?.paymentReference ?? null,
      amountCents: p.amountCents,
      currency: p.currency,
      receiptNumber: p.receiptNumber,
      statement: p.statement,
      disputed: p.disputeReportedAt !== null,
    }));
  }

  // --- Signalement par le commerçant -----------------------------------------------

  private sign(paymentId: string) {
    return hmacSha256(loadConfig().APP_ENCRYPTION_KEY, `collection-report:${paymentId}`).slice(0, 32);
  }

  reportToken(paymentId: string) {
    return `${paymentId}.${this.sign(paymentId)}`;
  }

  private async sendConfirmation(tenantId: string, p: { paymentId: string; amountCents: number; currency: string; partnerName: string; plan: string; periodEnd: Date }) {
    try {
      const tenant = await this.prisma.client.tenant.findUnique({ where: { id: tenantId }, include: { settings: true } });
      let to = tenant?.settings?.contactEmail ?? null;
      if (!to) {
        const owner = await this.prisma.client.tenantMembership.findFirst({ where: { tenantId, status: "ACTIVE", role: { key: "OWNER" } }, include: { user: { select: { email: true } } }, orderBy: { createdAt: "asc" } });
        to = owner?.user.email ?? null;
      }
      if (!to) return;
      const locale = tenantLocale(tenant?.settings);
      await this.email.send({
        to,
        ...collectionConfirmMessage(locale, {
          amount: formatMoney(p.amountCents, p.currency, locale),
          partner: p.partnerName,
          date: formatDay(new Date(), locale),
          plan: p.plan,
          until: formatDay(p.periodEnd, locale),
          reportUrl: `${loadConfig().APP_URL}/signalement?token=${encodeURIComponent(this.reportToken(p.paymentId))}`,
        }),
      });
    } catch (error) {
      this.logger.warn(`Confirmation d'encaissement non envoyée : ${(error as Error).message}`);
    }
  }

  /** Lien « Signaler un problème » de l'email de confirmation : l'équipe FOVE est alertée. */
  async report(token: string, note: string | undefined) {
    const [paymentId, sig] = token.split(".");
    if (!paymentId || !sig || !safeEqual(sig, this.sign(paymentId))) throw badRequest("invalid_token", "Lien invalide");
    const payment = await this.prisma.client.payment.findUnique({ where: { id: paymentId }, include: { tenant: { select: { name: true } }, collectorPartner: { select: { name: true, code: true } } } });
    if (!payment) throw badRequest("invalid_token", "Lien invalide");
    if (!payment.disputeReportedAt) {
      await this.prisma.client.payment.update({ where: { id: payment.id }, data: { disputeReportedAt: new Date(), disputeNote: note?.slice(0, 1000) ?? null } });
      await this.audit.log({ tenantId: payment.tenantId, action: "billing.collection_disputed", targetType: "payment", targetId: payment.id, metadata: { partner: payment.collectorPartner?.code ?? null } });
      try {
        await this.email.send({
          to: loadConfig().EMAIL_FROM,
          subject: `[Encaissement signalé] ${payment.tenant.name} · ${payment.collectorPartner?.code ?? "?"}`,
          text: `Le commerce ${payment.tenant.name} signale un problème sur l'encaissement ${payment.reference} (${(payment.amountCents / 100).toFixed(2)} ${payment.currency}) fait par ${payment.collectorPartner?.name ?? "?"} (${payment.collectorPartner?.code ?? "?"}).\n\nMessage : ${note || "(aucun)"}\n\n${loadConfig().APP_URL}/admin/finance/offline`,
        });
      } catch (error) {
        this.logger.warn(`Alerte de signalement non envoyée : ${(error as Error).message}`);
      }
    }
    return { reported: true };
  }
}
