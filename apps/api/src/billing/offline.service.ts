import { randomInt } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Prisma, type BankAccount, type Invoice, type PaymentProvider } from "@fove/database";
import { generatePaymentReference, normalizePaymentReference } from "@fove/shared";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { badRequest, notFound } from "../common/errors";
import type { TenantContext } from "../common/context";
import { loadConfig } from "../config";
import { EmailService } from "../notifications/email.service";
import { INTL_LOCALE, tenantLocale, type Locale } from "../i18n/locale";
import { bankText, offlineExpiredMessage, offlineInstructionsMessage, offlinePaidMessage } from "../i18n/offline-emails";
import { ReferralService } from "../referrals/referral.service";
import { PartnersService } from "../partners/partners.service";
import { PricingService } from "./pricing.service";

/** Accès provisoire d'une souscription par virement, en attendant le paiement. */
export const PROVISIONAL_DAYS = 7;
const DAY = 86_400_000;

/** Moyens de règlement hors ligne et fournisseur de paiement correspondant. */
export const OFFLINE_METHODS = { BANK_TRANSFER: "BANK_TRANSFER", CASH: "MANUAL", MOBILE_MONEY: "MOBILE_MONEY" } as const satisfies Record<string, PaymentProvider>;
export type OfflineMethod = keyof typeof OFFLINE_METHODS;

/** Contenu d'une facture hors ligne (Invoice.metadata). */
interface OfflineMeta {
  offline: true;
  planId: string;
  planCode: string;
  /** new : première souscription (ou reprise) ; renewal : période suivante d'un abonnement en cours. */
  kind: "new" | "renewal";
  discountCents: number;
  creditCents: number;
  provisional: boolean;
  expired?: boolean;
}

export interface ValidateInput {
  method: OfflineMethod;
  amountCents: number;
  paidAt?: Date;
  bankReference?: string | null;
  receiptNumber?: string | null;
  proofUrl?: string | null;
  note?: string | null;
  /** Montant inférieur au dû accepté (frais bancaires, arrondi). */
  acceptShortfall?: boolean;
}

/** Membre de l'équipe FOVE qui valide le paiement (back-office). */
export type Actor = { userId: string; email: string };

const meta = (invoice: Pick<Invoice, "metadata">) => invoice.metadata as unknown as OfflineMeta;

export function formatMoney(cents: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "currency", currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function formatDay(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "long" }).format(date);
}

function addYear(date: Date): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

/**
 * Encaissement hors ligne (docs/chantier-encaissement-hors-ligne.md) : facture avec référence de
 * paiement, accès provisoire de 7 jours (une fois par commerce), validation par FOVE ou par un
 * partenaire, expiration de l'accès provisoire sans paiement.
 */
@Injectable()
export class OfflineBillingService {
  private readonly logger = new Logger("OfflineBilling");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly pricing: PricingService,
    private readonly referrals: ReferralService,
    private readonly partners: PartnersService,
  ) {}

  // --- Coordonnées bancaires ---------------------------------------------------

  /** Coordonnées actives du pays, sinon celles par défaut (« * »). */
  async bankAccounts(country: string | null | undefined): Promise<BankAccount[]> {
    const db = this.prisma.client;
    const code = (country ?? "").toUpperCase();
    const local = code ? await db.bankAccount.findMany({ where: { country: code, active: true }, orderBy: { createdAt: "asc" } }) : [];
    return local.length ? local : db.bankAccount.findMany({ where: { country: "*", active: true }, orderBy: { createdAt: "asc" } });
  }

  listAllBankAccounts() {
    return this.prisma.client.bankAccount.findMany({ orderBy: [{ country: "asc" }, { createdAt: "asc" }] });
  }

  async saveBankAccount(id: string | null, data: Omit<BankAccount, "id" | "createdAt" | "updatedAt">, actor: { userId: string; email: string }) {
    const saved = id ? await this.prisma.client.bankAccount.update({ where: { id }, data }) : await this.prisma.client.bankAccount.create({ data });
    await this.prisma.client.financialAuditLog.create({
      data: { actorUserId: actor.userId, actorEmail: actor.email, action: id ? "bank_account.updated" : "bank_account.created", entityType: "bank_account", entityId: saved.id, newValue: data as unknown as Prisma.InputJsonValue },
    });
    return saved;
  }

  async deleteBankAccount(id: string, actor: { userId: string; email: string }) {
    await this.prisma.client.bankAccount.delete({ where: { id } });
    await this.prisma.client.financialAuditLog.create({ data: { actorUserId: actor.userId, actorEmail: actor.email, action: "bank_account.deleted", entityType: "bank_account", entityId: id } });
  }

  // --- Espace commerçant ------------------------------------------------------

  /** Règlement hors ligne proposé au commerce : coordonnées de son pays et facture en attente. */
  async summary(tenantId: string) {
    const settings = await this.prisma.client.tenantSettings.findUnique({ where: { tenantId }, select: { country: true } });
    const [accounts, invoice] = await Promise.all([this.bankAccounts(settings?.country), this.openInvoice(tenantId)]);
    const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId }, select: { provisionalUntil: true } });
    return {
      available: accounts.length > 0,
      accounts: accounts.map(({ id, beneficiary, bankName, iban, accountNumber, swift, instructions, currency }) => ({ id, beneficiary, bankName, iban, accountNumber, swift, instructions, currency })),
      invoice: invoice
        ? {
            id: invoice.id,
            reference: invoice.paymentReference,
            amountCents: invoice.amountDueCents,
            currency: invoice.currency,
            planCode: meta(invoice).planCode,
            kind: meta(invoice).kind,
            provisionalUntil: meta(invoice).provisional ? sub?.provisionalUntil ?? null : null,
            createdAt: invoice.createdAt,
          }
        : null,
    };
  }

  private openInvoice(tenantId: string) {
    return this.prisma.client.invoice.findFirst({ where: { tenantId, status: "OPEN", paymentReference: { not: null } }, orderBy: { createdAt: "desc" } });
  }

  private async newReference(): Promise<string> {
    for (let i = 0; i < 10; i += 1) {
      const reference = generatePaymentReference("invoice", (n) => randomInt(0, n));
      if (!(await this.prisma.client.invoice.count({ where: { paymentReference: reference } }))) return reference;
    }
    throw new Error("Référence de paiement : trop de collisions");
  }

  /**
   * Demande de règlement hors ligne d'une offre : facture avec référence, dans la monnaie du commerce.
   * Sans abonnement payant en cours, l'offre s'active tout de suite pour 7 jours (une seule fois par
   * commerce) ; avec un abonnement hors ligne en cours, la facture couvre la période suivante.
   */
  async request(tenantId: string, planCode: string, opts: { actorUserId?: string; withProvisional?: boolean; silent?: boolean } = {}) {
    const db = this.prisma.client;
    const plan = await db.subscriptionPlan.findFirst({ where: { code: planCode, active: true }, include: { prices: true } });
    if (!plan) throw notFound("Offre");
    if (plan.kind !== "PAID") throw badRequest("plan_not_purchasable", "Cette offre ne s'achète pas en ligne");
    const sub = await db.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    const now = new Date();
    const running = sub && sub.plan.kind !== "FREE" && sub.status !== "CANCELED" && sub.status !== "INCOMPLETE" && (!sub.currentPeriodEnd || sub.currentPeriodEnd > now);
    const provisionalRunning = running && sub.provider === "OFFLINE" && sub.provisionalUntil !== null;
    if (running && !provisionalRunning) {
      if (sub.provider === "STRIPE" && sub.stripeSubscriptionId) throw badRequest("stripe_managed", "Votre abonnement est réglé par carte : changez d'offre depuis la page Abonnement.");
      if (sub.provider === "MANUAL" || sub.plan.kind === "CUSTOM") throw badRequest("contract_managed", "Votre abonnement est géré par l’équipe FOVE : contactez-nous pour le modifier.");
    }
    const kind: OfflineMeta["kind"] = running && !provisionalRunning ? "renewal" : "new";
    // Monnaie : celle de l'abonnement pour un renouvellement, sinon celle du commerce (au renouvellement, le nouveau choix s'applique).
    const currency = await this.pricing.tenantCurrency(tenantId);
    const price = this.pricing.yearlyCents(plan, currency);
    if (price === null) throw badRequest("price_missing", "Prix non configuré pour cette offre dans cette monnaie");

    // Une seule facture hors ligne en attente : la précédente est remplacée.
    const previous = await this.openInvoice(tenantId);
    if (previous) {
      if (meta(previous).planId === plan.id && previous.currency === currency) return { invoice: previous, created: false };
      await db.invoice.update({ where: { id: previous.id }, data: { status: "VOID", voidedAt: now, amountDueCents: 0 } });
    }

    const discountCents = kind === "new" ? Math.min(await this.referrals.refereeDiscount(tenantId, currency), price) : 0;
    const creditCents = Math.min(await this.referrals.availableCredit(tenantId, currency), price - discountCents);
    const amount = price - discountCents - creditCents;
    // Accès provisoire : une fois par commerce (un accès provisoire expiré sans paiement n'est pas renouvelé).
    const expiredBefore = await db.invoice.count({ where: { tenantId, metadata: { path: ["expired"], equals: true } } });
    const provisional = kind === "new" && opts.withProvisional !== false && (provisionalRunning || expiredBefore === 0);
    const reference = await this.newReference();
    const periodStart = kind === "renewal" ? sub!.currentPeriodEnd ?? now : now;
    const invoice = await db.invoice.create({
      data: {
        number: `INV-${now.getUTCFullYear()}-${reference.slice(3).replace("-", "")}`,
        tenantId,
        subscriptionId: sub?.id ?? null,
        status: "OPEN",
        currency,
        amountSubtotalCents: price,
        amountDiscountCents: discountCents + creditCents,
        amountTotalCents: amount,
        amountDueCents: amount,
        periodStart,
        periodEnd: addYear(periodStart),
        dueDate: kind === "renewal" ? periodStart : new Date(now.getTime() + PROVISIONAL_DAYS * DAY),
        paymentReference: reference,
        billingReason: kind === "renewal" ? "offline_renewal" : "offline_subscription",
        metadata: { offline: true, planId: plan.id, planCode: plan.code, kind, discountCents, creditCents, provisional } satisfies OfflineMeta as unknown as Prisma.InputJsonValue,
        lines: { create: [{ description: `FOVE ${plan.name} (1 an)`, unitAmountCents: price, amountSubtotalCents: price, amountTotalCents: price, currency, planId: plan.id }] },
      },
    });

    if (provisional) {
      const until = provisionalRunning ? sub!.provisionalUntil! : new Date(now.getTime() + PROVISIONAL_DAYS * DAY);
      const data = {
        planId: plan.id,
        status: "ACTIVE" as const,
        provider: "OFFLINE" as const,
        interval: "YEAR" as const,
        currency,
        provisionalUntil: until,
        currentPeriodEnd: until,
        cancelAtPeriodEnd: false,
        scheduledPlanId: null,
        pastDueSince: null,
        limitsOverride: Prisma.DbNull,
        featuresOverride: Prisma.DbNull,
        contractPriceYearlyCents: null,
      };
      await db.subscription.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
    }
    await this.audit.log({ tenantId, actorUserId: opts.actorUserId, action: "billing.offline_requested", targetType: "invoice", targetId: invoice.id, metadata: { reference, plan: plan.code, kind, amountCents: amount, currency, provisional } });
    // Paiement déjà reçu et saisi par FOVE (fiche entreprise) : pas d'email d'instructions.
    if (!opts.silent) await this.sendInstructions(tenantId, invoice, plan.name);
    return { invoice, created: true };
  }

  /** Renonce à la facture hors ligne en attente ; un accès provisoire en cours prend fin. */
  async cancelRequest(ctx: TenantContext) {
    const invoice = await this.openInvoice(ctx.tenantId);
    if (!invoice) throw badRequest("nothing_pending", "Aucun règlement hors ligne en attente");
    await this.voidInvoice(invoice, { reason: "merchant", endProvisional: true });
    await this.audit.forTenant(ctx, "billing.offline_cancelled", undefined, { reference: invoice.paymentReference });
  }

  private async voidInvoice(invoice: Invoice, opts: { reason: string; endProvisional: boolean; expired?: boolean }) {
    const db = this.prisma.client;
    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: "VOID", voidedAt: new Date(), amountDueCents: 0, metadata: { ...meta(invoice), ...(opts.expired ? { expired: true } : {}), voidReason: opts.reason } as unknown as Prisma.InputJsonValue },
    });
    if (opts.endProvisional && meta(invoice).provisional) {
      await db.subscription.updateMany({ where: { tenantId: invoice.tenantId, provider: "OFFLINE", provisionalUntil: { not: null } }, data: { status: "CANCELED", provisionalUntil: null, currentPeriodEnd: new Date() } });
    }
  }

  private async recipient(tenantId: string): Promise<{ to: string | null; locale: Locale }> {
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id: tenantId }, include: { settings: true } });
    let to = tenant?.settings?.contactEmail ?? null;
    if (!to) {
      const owner = await this.prisma.client.tenantMembership.findFirst({ where: { tenantId, status: "ACTIVE", role: { key: "OWNER" } }, include: { user: { select: { email: true } } }, orderBy: { createdAt: "asc" } });
      to = owner?.user.email ?? null;
    }
    return { to, locale: tenantLocale(tenant?.settings) };
  }

  private async sendInstructions(tenantId: string, invoice: Invoice, planName: string) {
    try {
      const { to, locale } = await this.recipient(tenantId);
      if (!to) return;
      const settings = await this.prisma.client.tenantSettings.findUnique({ where: { tenantId }, select: { country: true } });
      const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId }, select: { provisionalUntil: true } });
      const provisionalUntil = meta(invoice).provisional && sub?.provisionalUntil ? formatDay(sub.provisionalUntil, locale) : null;
      await this.email.send({
        to,
        ...offlineInstructionsMessage(locale, {
          plan: planName,
          amount: formatMoney(invoice.amountDueCents, invoice.currency, locale),
          reference: invoice.paymentReference!,
          bank: bankText(locale, await this.bankAccounts(settings?.country)),
          provisionalUntil,
          billingUrl: `${loadConfig().APP_URL}/app/billing`,
        }),
      });
    } catch (error) {
      this.logger.warn(`Instructions de paiement non envoyées (${tenantId}) : ${(error as Error).message}`);
    }
  }

  // --- Validation ---------------------------------------------------------------

  /** Facture hors ligne à partir de sa référence (saisie tolérante). */
  async findByReference(input: string) {
    const parsed = normalizePaymentReference(input);
    if (!parsed || parsed.kind !== "invoice") return null;
    return this.prisma.client.invoice.findUnique({ where: { paymentReference: parsed.reference }, include: { tenant: { select: { id: true, name: true, slug: true } } } });
  }

  /**
   * Paiement reçu (FOVE ou partenaire encaisseur) : paiement enregistré, facture payée, abonnement
   * activé ou prolongé d'un an, puis commission, parrainage et email de confirmation.
   */
  async validate(invoiceId: string, input: ValidateInput, actor: Actor) {
    const db = this.prisma.client;
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || !invoice.paymentReference) throw notFound("Facture");
    if (invoice.status !== "OPEN") throw badRequest("invoice_not_open", "Cette facture n'est pas en attente de paiement");
    if (input.amountCents < invoice.amountDueCents && !input.acceptShortfall) {
      throw badRequest("amount_short", `Montant inférieur au montant dû (${(invoice.amountDueCents / 100).toFixed(2)} ${invoice.currency})`);
    }
    const m = meta(invoice);
    const plan = await db.subscriptionPlan.findUniqueOrThrow({ where: { id: m.planId } });
    const paidAt = input.paidAt ?? new Date();
    const now = new Date();

    const result = await db.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({ where: { id: invoice.id, status: "OPEN" }, data: { status: "PAID", paidAt, amountPaidCents: input.amountCents, amountDueCents: 0 } });
      if (claimed.count === 0) throw badRequest("invoice_not_open", "Cette facture n'est pas en attente de paiement");
      const payment = await tx.payment.create({
        data: {
          reference: `PAY-${invoice.paymentReference}`,
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          provider: OFFLINE_METHODS[input.method],
          providerPaymentId: input.bankReference || null,
          amountCents: input.amountCents,
          netCents: input.amountCents,
          currency: invoice.currency,
          status: "SUCCEEDED",
          method: input.method.toLowerCase(),
          receiptNumber: input.receiptNumber || null,
          proofUrl: input.proofUrl || null,
          confirmedAt: paidAt,
        },
      });
      // Période : un renouvellement prolonge l'abonnement en cours ; sinon elle part du début de l'accès.
      const sub = await tx.subscription.findUnique({ where: { tenantId: invoice.tenantId } });
      const stillRunning = sub && sub.status !== "CANCELED" && sub.currentPeriodEnd && sub.currentPeriodEnd > now && sub.provisionalUntil === null;
      const start = m.kind === "renewal" && stillRunning ? sub.currentPeriodEnd! : m.provisional && invoice.periodStart ? invoice.periodStart : now;
      const periodEnd = addYear(start);
      const data = {
        planId: plan.id,
        status: "ACTIVE" as const,
        provider: "OFFLINE" as const,
        interval: "YEAR" as const,
        currency: invoice.currency,
        provisionalUntil: null,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        scheduledPlanId: null,
        pastDueSince: null,
        stripeSubscriptionId: null,
        limitsOverride: Prisma.DbNull,
        featuresOverride: Prisma.DbNull,
        contractPriceYearlyCents: null,
      };
      const subscription = await tx.subscription.upsert({ where: { tenantId: invoice.tenantId }, update: data, create: { tenantId: invoice.tenantId, ...data } });
      await tx.invoice.update({ where: { id: invoice.id }, data: { subscriptionId: subscription.id, periodStart: start, periodEnd } });
      if (m.creditCents > 0) await this.referrals.consumeCredit(invoice.tenantId, m.creditCents, invoice.currency, payment.id, tx);
      return { payment, periodEnd };
    });

    if (m.discountCents > 0) await this.referrals.markRefereeDiscountUsed(invoice.tenantId, m.discountCents);
    await this.referrals.onPaymentConfirmed(result.payment);
    try {
      await this.partners.handlePaymentConfirmed(result.payment);
    } catch (error) {
      this.logger.error("Erreur calcul commission partenaire", error);
    }
    await db.financialAuditLog.create({
      data: {
        actorUserId: actor.userId,
        actorEmail: actor.email,
        action: "billing.offline_validated",
        entityType: "invoice",
        entityId: invoice.id,
        newValue: { reference: invoice.paymentReference, method: input.method, amountCents: input.amountCents, currency: invoice.currency, receiptNumber: input.receiptNumber ?? null, bankReference: input.bankReference ?? null },
        reason: input.note ?? null,
      },
    });
    await this.audit.log({ tenantId: invoice.tenantId, actorUserId: actor.userId, action: "billing.offline_paid", targetType: "invoice", targetId: invoice.id, metadata: { reference: invoice.paymentReference } });

    // Confirmation au commerçant.
    try {
      const { to, locale } = await this.recipient(invoice.tenantId);
      if (to) {
        await this.email.send({
          to,
          ...offlinePaidMessage(locale, {
            plan: plan.name,
            amount: formatMoney(input.amountCents, invoice.currency, locale),
            reference: invoice.paymentReference,
            until: formatDay(result.periodEnd, locale),
            billingUrl: `${loadConfig().APP_URL}/app/billing`,
          }),
        });
      }
    } catch (error) {
      this.logger.warn(`Confirmation de paiement non envoyée : ${(error as Error).message}`);
    }
    return { payment: result.payment, periodEnd: result.periodEnd, plan };
  }

  /**
   * « Enregistrer un paiement reçu » (fiche entreprise) : paiement déjà reçu par FOVE (espèces au
   * bureau, virement, mobile money). La facture est créée sans email d'instructions puis validée.
   */
  async recordReceived(
    tenantId: string,
    input: Omit<ValidateInput, "amountCents"> & { planCode: string; amountCents?: number },
    actor: Actor,
  ) {
    const { invoice, created } = await this.request(tenantId, input.planCode, { actorUserId: actor.userId, withProvisional: false, silent: true });
    try {
      const result = await this.validate(invoice.id, { ...input, amountCents: input.amountCents ?? invoice.amountDueCents }, actor);
      return { ...result, reference: invoice.paymentReference, currency: invoice.currency };
    } catch (error) {
      // Montant insuffisant… : la facture créée pour l'occasion ne reste pas en attente chez le commerçant.
      if (created) await this.voidInvoice(invoice, { reason: "admin_record_failed", endProvisional: false });
      throw error;
    }
  }

  /** Annulation d'une facture hors ligne par l'équipe FOVE. */
  async voidByAdmin(invoiceId: string, reason: string, actor: { userId: string; email: string }) {
    const invoice = await this.prisma.client.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice?.paymentReference) throw notFound("Facture");
    if (invoice.status !== "OPEN") throw badRequest("invoice_not_open", "Cette facture n'est pas en attente de paiement");
    await this.voidInvoice(invoice, { reason: `admin: ${reason}`, endProvisional: true });
    await this.prisma.client.financialAuditLog.create({
      data: { actorUserId: actor.userId, actorEmail: actor.email, action: "billing.offline_voided", entityType: "invoice", entityId: invoice.id, reason },
    });
  }

  // --- Tâche planifiée -----------------------------------------------------------

  /** Accès provisoire arrivé à échéance sans paiement : facture expirée, retour au Gratuit, email. */
  async expireProvisional(now = new Date()): Promise<number> {
    const db = this.prisma.client;
    const subs = await db.subscription.findMany({ where: { provider: "OFFLINE", provisionalUntil: { lt: now }, status: { not: "CANCELED" } }, include: { plan: true } });
    let expired = 0;
    for (const sub of subs) {
      const invoice = await this.openInvoice(sub.tenantId);
      if (invoice) await this.voidInvoice(invoice, { reason: "expired", endProvisional: false, expired: true });
      await db.subscription.update({ where: { id: sub.id }, data: { status: "CANCELED", provisionalUntil: null } });
      await this.audit.log({ tenantId: sub.tenantId, action: "billing.offline_expired", metadata: { reference: invoice?.paymentReference ?? null } });
      try {
        const { to, locale } = await this.recipient(sub.tenantId);
        if (to && invoice) await this.email.send({ to, ...offlineExpiredMessage(locale, { plan: sub.plan.name, reference: invoice.paymentReference!, billingUrl: `${loadConfig().APP_URL}/app/billing` }) });
      } catch (error) {
        this.logger.warn(`Email d'expiration non envoyé : ${(error as Error).message}`);
      }
      expired += 1;
    }
    return expired;
  }

  // --- Back-office ------------------------------------------------------------

  async list(filter: { status?: string; q?: string }) {
    const parsed = filter.q ? normalizePaymentReference(filter.q) : null;
    const where: Prisma.InvoiceWhereInput = {
      paymentReference: parsed ? parsed.reference : { not: null },
      ...(filter.status && filter.status !== "ALL" ? { status: filter.status as Prisma.InvoiceWhereInput["status"] } : {}),
      ...(filter.q && !parsed ? { OR: [{ paymentReference: { contains: filter.q.toUpperCase() } }, { tenant: { name: { contains: filter.q, mode: "insensitive" } } }] } : {}),
    };
    const rows = await this.prisma.client.invoice.findMany({
      where,
      include: { tenant: { select: { id: true, name: true, slug: true } }, payments: { select: { id: true, provider: true, method: true, amountCents: true, receiptNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) => ({ ...r, plan: meta(r).planCode, kind: meta(r).kind, provisional: meta(r).provisional }));
  }
}
