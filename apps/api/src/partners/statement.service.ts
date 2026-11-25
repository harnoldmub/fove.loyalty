import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { convertCents, normalizePaymentReference } from "@fove/shared";
import { PrismaService } from "../common/prisma.service";
import { badRequest, notFound } from "../common/errors";
import { EmailService } from "../notifications/email.service";
import { OfflineBillingService, formatDay, formatMoney } from "../billing/offline.service";
import { PricingService } from "../billing/pricing.service";
import { ReconciliationService, type StatementPaymentHandler } from "../admin/finance/reconciliation.service";
import { bankText, statementMessage } from "../i18n/offline-emails";
import { INTL_LOCALE, localeForCountry, normalizeLocale } from "../i18n/locale";

/** Délai de paiement d'un relevé dont le solde est dû à FOVE. */
export const STATEMENT_DUE_DAYS = 15;
const DAY = 86_400_000;

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * Relevés mensuels des partenaires encaisseurs (docs/chantier-encaissement-hors-ligne.md, 7) :
 * encaissé pour FOVE − frais d'encaissement − commissions disponibles (y compris celles des paiements
 * en ligne) = solde. Solde positif : le partenaire le verse à FOVE sous 15 jours avec la référence du
 * relevé ; solde négatif : FOVE lui verse la différence (demande de versement créée).
 */
@Injectable()
export class StatementService implements StatementPaymentHandler, OnModuleInit {
  private readonly logger = new Logger("Statements");

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly pricing: PricingService,
    private readonly offline: OfflineBillingService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  onModuleInit() {
    this.reconciliation.registerStatements(this);
  }

  /**
   * Émet les relevés des encaissements antérieurs au mois en cours, un par partenaire et par monnaie
   * encaissée. Sans nouvel encaissement, rien n'est émis (les commissions suivent le versement habituel).
   */
  async issueMonthly(now = new Date()): Promise<number> {
    const db = this.prisma.client;
    const periodEnd = monthStart(now);
    const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1));
    const payments = await db.payment.findMany({
      where: { collectorPartnerId: { not: null }, statementId: null, status: "SUCCEEDED", confirmedAt: { lt: periodEnd } },
      select: { id: true, collectorPartnerId: true, amountCents: true, currency: true },
    });
    const byPartner = new Map<string, typeof payments>();
    for (const p of payments) byPartner.set(p.collectorPartnerId!, [...(byPartner.get(p.collectorPartnerId!) ?? []), p]);

    const rates = await this.pricing.rates();
    let issued = 0;
    for (const [partnerId, list] of byPartner) {
      const partner = await db.partner.findUniqueOrThrow({ where: { id: partnerId } });
      // Une monnaie encaissée = un relevé ; les commissions sont déduites du relevé le plus important.
      const currencies = [...new Set(list.map((p) => p.currency))].sort(
        (a, b) =>
          (convertCents(list.filter((p) => p.currency === b).reduce((s, p) => s + p.amountCents, 0), b, "EUR", rates) ?? 0) -
          (convertCents(list.filter((p) => p.currency === a).reduce((s, p) => s + p.amountCents, 0), a, "EUR", rates) ?? 0),
      );
      for (const [index, currency] of currencies.entries()) {
        const exists = await db.partnerStatement.findUnique({ where: { partnerId_periodStart_currency: { partnerId, periodStart, currency } } });
        if (exists) continue;
        const group = list.filter((p) => p.currency === currency);
        const fees = await db.partnerCommission.findMany({ where: { partnerId, kind: "COLLECTION_FEE", statementId: null, paymentId: { in: group.map((p) => p.id) }, status: { notIn: ["CANCELLED", "REVERSED"] } } });
        const commissions = index === 0 ? await db.partnerCommission.findMany({ where: { partnerId, kind: "ACQUISITION", status: "AVAILABLE", statementId: null, payoutId: null } }) : [];
        const collectedCents = group.reduce((s, p) => s + p.amountCents, 0);
        const feesCents = fees.reduce((s, c) => s + c.commissionAmountCents, 0);
        const commissionsCents = commissions.reduce(
          (s, c) => s + (convertCents(c.payoutAmountCents ?? c.commissionAmountCents, c.payoutCurrency ?? c.currency, currency, rates) ?? 0),
          0,
        );
        const balanceCents = collectedCents - feesCents - commissionsCents;
        const reference = await this.offline.statementReference();
        const createdAt = new Date();
        const statement = await db.$transaction(async (tx) => {
          const created = await tx.partnerStatement.create({
            data: {
              partnerId,
              reference,
              periodStart,
              periodEnd: new Date(periodEnd.getTime() - 1),
              currency,
              collectedCents,
              commissionsCents,
              feesCents,
              balanceCents,
              status: balanceCents > 0 ? "ISSUED" : "SETTLED",
              dueAt: new Date(createdAt.getTime() + STATEMENT_DUE_DAYS * DAY),
              paidAt: balanceCents > 0 ? null : createdAt,
            },
          });
          await tx.payment.updateMany({ where: { id: { in: group.map((p) => p.id) } }, data: { statementId: created.id } });
          // Commissions et frais compensés : réglés par le relevé.
          await tx.partnerCommission.updateMany({ where: { id: { in: [...fees, ...commissions].map((c) => c.id) } }, data: { statementId: created.id, status: "PAID", paidAt: createdAt } });
          if (balanceCents < 0) {
            const owed = convertCents(-balanceCents, currency, partner.payoutCurrency, rates);
            await tx.partnerPayout.create({
              data: {
                partnerId,
                amountCents: owed ?? -balanceCents,
                currency: owed === null ? currency : partner.payoutCurrency,
                method: "Compensation relevé",
                status: "PENDING",
                reference,
                paidAt: null,
              },
            });
          }
          return created;
        });
        issued += 1;
        await this.notify(partner, statement);
      }
    }
    return issued;
  }

  private async notify(partner: { email: string; country: string | null; userId: string | null }, s: { reference: string; periodStart: Date; currency: string; collectedCents: number; feesCents: number; commissionsCents: number; balanceCents: number; dueAt: Date }) {
    try {
      const user = partner.userId ? await this.prisma.client.user.findUnique({ where: { id: partner.userId }, select: { locale: true } }) : null;
      const locale = normalizeLocale(user?.locale) ?? localeForCountry(partner.country);
      const period = new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" }).format(s.periodStart);
      await this.email.send({
        to: partner.email,
        ...statementMessage(locale, {
          reference: s.reference,
          period,
          collected: formatMoney(s.collectedCents, s.currency, locale),
          deducted: formatMoney(s.feesCents + s.commissionsCents, s.currency, locale),
          balance: formatMoney(Math.abs(s.balanceCents), s.currency, locale),
          owes: s.balanceCents > 0,
          due: formatDay(s.dueAt, locale),
          bank: bankText(locale, await this.offline.bankAccounts(partner.country)),
        }),
      });
    } catch (error) {
      this.logger.warn(`Relevé ${s.reference} non envoyé : ${(error as Error).message}`);
    }
  }

  // --- Paiement du solde par le partenaire ------------------------------------------

  async findOpenByReference(input: string) {
    const parsed = normalizePaymentReference(input);
    if (!parsed || parsed.kind !== "statement") return null;
    return this.prisma.client.partnerStatement.findFirst({ where: { reference: parsed.reference, status: "ISSUED" }, select: { id: true, balanceCents: true, paidCents: true, currency: true } });
  }

  /** Versement reçu du partenaire (rapprochement bancaire ou saisie) ; paiement partiel accepté. */
  async recordPayment(statementId: string, amountCents: number, actor: { userId: string; email: string }, bankReference: string) {
    const db = this.prisma.client;
    const statement = await db.partnerStatement.findUnique({ where: { id: statementId } });
    if (!statement) throw notFound("Relevé");
    if (statement.status !== "ISSUED") throw badRequest("statement_closed", "Ce relevé est déjà réglé");
    if (amountCents <= 0) throw badRequest("invalid_amount", "Montant invalide");
    const paidCents = statement.paidCents + amountCents;
    const settled = paidCents >= statement.balanceCents;
    await db.partnerStatement.update({ where: { id: statementId }, data: { paidCents, status: settled ? "PAID" : "ISSUED", paidAt: settled ? new Date() : null } });
    await db.financialAuditLog.create({
      data: { actorUserId: actor.userId, actorEmail: actor.email, action: "partner.statement_paid", entityType: "partner_statement", entityId: statementId, newValue: { amountCents, paidCents, currency: statement.currency, settled, bankReference } },
    });
  }

  // --- Lecture ---------------------------------------------------------------------

  list(filter: { status?: string; partnerId?: string }) {
    return this.prisma.client.partnerStatement.findMany({
      where: {
        ...(filter.status && filter.status !== "ALL" ? { status: filter.status as "ISSUED" | "PAID" | "SETTLED" } : {}),
        ...(filter.partnerId ? { partnerId: filter.partnerId } : {}),
      },
      include: { partner: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  forPartner(partnerId: string) {
    return this.prisma.client.partnerStatement.findMany({ where: { partnerId }, orderBy: { createdAt: "desc" }, take: 24 });
  }
}
