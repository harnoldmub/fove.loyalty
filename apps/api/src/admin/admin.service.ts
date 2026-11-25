import { Injectable } from "@nestjs/common";
import { Prisma } from "@fove/database";
import { z } from "zod";
import { BILLING_CURRENCIES, convertCents, isOnlineCurrency, PLAN_FEATURE_KEYS, QUOTA_KEYS, REFERENCE_CURRENCY } from "@fove/shared";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { badRequest, notFound } from "../common/errors";
import type { AuthState } from "../common/context";
import { BillingService } from "../billing/billing.service";
import { PricingService } from "../billing/pricing.service";

export const updatePlanSchema = z.object({
  name: z.string().min(2).max(40).optional(),
  description: z.string().max(300).optional(),
  /** Prix annuel par monnaie ; tarif Stripe pour EUR et USD seulement (les autres se règlent hors ligne). */
  prices: z
    .array(
      z.object({
        currency: z.enum(BILLING_CURRENCIES),
        yearlyCents: z.int().min(0).max(100_000_000_000),
        stripePriceId: z.string().trim().max(100).nullable().optional(),
      }),
    )
    .max(BILLING_CURRENCIES.length)
    .refine((list) => new Set(list.map((p) => p.currency)).size === list.length, "Une ligne par monnaie")
    .refine((list) => list.every((p) => !p.stripePriceId || isOnlineCurrency(p.currency)), "Tarif Stripe : EUR et USD seulement")
    .optional(),
  trialDays: z.int().min(0).max(90).optional(),
  features: z.object(Object.fromEntries(PLAN_FEATURE_KEYS.map((k) => [k, z.boolean()])) as Record<(typeof PLAN_FEATURE_KEYS)[number], z.ZodBoolean>).optional(),
  limits: z.object(Object.fromEntries(QUOTA_KEYS.map((k) => [k, z.int().min(1).nullable()])) as Record<(typeof QUOTA_KEYS)[number], z.ZodNullable<z.ZodInt>>).optional(),
  active: z.boolean().optional(),
});

/**
 * Abonnement attribué par l'admin (essai accordé, contrat sur-mesure). Chaque
 * appel décrit le contrat complet : une dérogation absente est retirée.
 */
export const setSubscriptionSchema = z.object({
  planCode: z.string().min(2).max(40),
  status: z.enum(["TRIALING", "ACTIVE", "CANCELED"]),
  trialDays: z.int().min(1).max(365).optional(),
  /** Fin du contrat ; à cette date l'entreprise repasse sur l'offre Gratuite. */
  currentPeriodEnd: z.iso.datetime().nullable().optional(),
  limitsOverride: z.object(Object.fromEntries(QUOTA_KEYS.map((k) => [k, z.int().min(1).nullable()]))).partial().nullable().optional(),
  featuresOverride: z.object(Object.fromEntries(PLAN_FEATURE_KEYS.map((k) => [k, z.boolean()]))).partial().nullable().optional(),
  contractPriceYearlyCents: z.int().min(0).max(100_000_000_000).nullable().optional(),
  /** Monnaie du contrat (prix et factures) ; par défaut celle du commerce. */
  currency: z.enum(BILLING_CURRENCIES).optional(),
});

export const tenantCurrencySchema = z.object({ currency: z.enum(BILLING_CURRENCIES).nullable() });


export const supportAccessSchema = z.object({
  reason: z.string().trim().min(10).max(300),
  minutes: z.int().min(5).max(120).default(30),
});

export const updateMessageSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "CONTACTED", "ARCHIVED"]).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** Administration FOVE (Dizayna). Chaque action sensible est auditée. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly pricing: PricingService,
  ) {}

  async stats() {
    const db = this.prisma.client;
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [tenants, suspended, newTenants, subs, customers, accounts, transactions30d] = await Promise.all([
      db.tenant.count(),
      db.tenant.count({ where: { status: "SUSPENDED" } }),
      db.tenant.count({ where: { createdAt: { gte: since } } }),
      db.subscription.findMany({ include: { plan: { include: { prices: true } } } }),
      db.customer.count({ where: { anonymizedAt: null } }),
      db.loyaltyAccount.count(),
      db.loyaltyTransaction.count({ where: { createdAt: { gte: since } } }),
    ]);
    const byStatus: Record<string, number> = {};
    const byPlan: Record<string, number> = {};
    // MRR par monnaie, et total consolidé en euros au taux comptable.
    const mrrByCurrency: Record<string, number> = {};
    let paying = 0;
    let free = 0;
    for (const s of subs) {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
      const running = s.status === "ACTIVE" || s.status === "PAST_DUE";
      if (running && s.plan.kind === "FREE") free += 1;
      else if (running) paying += 1;
      if (s.status === "ACTIVE" || s.status === "PAST_DUE") {
        byPlan[s.plan.code] = (byPlan[s.plan.code] ?? 0) + 1;
        // Le MRR ne compte que les abonnements réellement facturés : Stripe et contrats sur-mesure.
        const yearly = s.provider === "STRIPE" ? this.pricing.yearlyCents(s.plan, s.currency) : s.provider === "MANUAL" ? s.contractPriceYearlyCents : null;
        if (yearly) mrrByCurrency[s.currency] = (mrrByCurrency[s.currency] ?? 0) + Math.round(yearly / 12);
      }
    }
    // Une entreprise sans abonnement en cours (résilié, essai expiré) relève aussi du Gratuit.
    free += tenants - subs.filter((s) => s.status === "ACTIVE" || s.status === "PAST_DUE" || s.status === "TRIALING").length;
    const rates = await this.pricing.rates();
    const mrrCents = Object.entries(mrrByCurrency).reduce((sum, [currency, cents]) => sum + (convertCents(cents, currency, REFERENCE_CURRENCY, rates) ?? 0), 0);
    return { tenants, suspended, newTenants30d: newTenants, subscriptionsByStatus: byStatus, activeByPlan: byPlan, paying, free, mrrCents, mrrCurrency: REFERENCE_CURRENCY, mrrByCurrency, customers, accounts, transactions30d };
  }

  async listTenants(q: string | undefined) {
    const where: Prisma.TenantWhereInput = q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q.toLowerCase() } }, { memberships: { some: { user: { email: { contains: q.toLowerCase() } } } } }] }
      : {};
    const tenants = await this.prisma.client.tenant.findMany({
      where,
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        settings: { select: { logoUrl: true, primaryColor: true } },
        subscription: { include: { plan: { select: { code: true, name: true, kind: true } } } },
        _count: { select: { customers: true, accounts: true, memberships: true } },
      },
    });
    return tenants;
  }

  async tenant(id: string) {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id },
      include: {
        settings: true,
        subscription: { include: { plan: true } },
        memberships: { include: { user: { select: { email: true, name: true } }, role: { select: { key: true } } } },
        establishments: { select: { id: true, name: true, city: true, address: true } },
        programs: { select: { id: true, name: true, mode: true, stampsTarget: true } },
        integrations: true,
        _count: { select: { customers: true, accounts: true, transactions: true, programs: true, establishments: true } },
      },
    });
    if (!tenant) throw notFound("Entreprise");

    const audit = await this.prisma.client.auditLog.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return { ...tenant, billingCurrency: await this.pricing.tenantCurrency(id), audit };
  }

  listMessages(status?: string) {
    const where: Prisma.ContactMessageWhereInput = {};
    if (status && status !== "ALL") where.status = status as Prisma.ContactMessageWhereInput["status"];
    return this.prisma.client.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async updateMessage(id: string, data: z.infer<typeof updateMessageSchema>) {
    return this.prisma.client.contactMessage.update({
      where: { id },
      data,
    });
  }

  async setStatus(auth: AuthState, id: string, status: "ACTIVE" | "SUSPENDED", reason: string) {
    const { count } = await this.prisma.client.tenant.updateMany({
      where: { id },
      data: { status, suspendedAt: status === "SUSPENDED" ? new Date() : null, suspendedReason: status === "SUSPENDED" ? reason : null },
    });
    if (count === 0) throw notFound("Entreprise");
    await this.audit.log({ tenantId: id, actorUserId: auth.user.id, action: status === "SUSPENDED" ? "admin.tenant_suspended" : "admin.tenant_reactivated", metadata: { reason } });
  }

  async setSubscription(auth: AuthState, tenantId: string, input: z.infer<typeof setSubscriptionSchema>) {
    const plan = await this.prisma.client.subscriptionPlan.findUnique({ where: { code: input.planCode } });
    if (!plan) throw notFound("Offre");
    const { status } = input;
    const trialEndsAt = status === "TRIALING" ? new Date(Date.now() + (input.trialDays ?? plan.trialDays) * 86_400_000) : null;
    const existing = await this.prisma.client.subscription.findUnique({ where: { tenantId } });
    const currency = input.currency ?? (await this.pricing.tenantCurrency(tenantId));
    // Le contrat remplace l'abonnement Stripe en cours : on l'arrête pour que Stripe ne prélève plus.
    const stripeEnded = existing ? await this.billing.endStripeSubscription(existing) : false;
    const data = {
      planId: plan.id,
      status,
      trialEndsAt,
      provider: "MANUAL" as const,
      currency,
      currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null,
      cancelAtPeriodEnd: false,
      limitsOverride: input.limitsOverride ?? Prisma.DbNull,
      featuresOverride: input.featuresOverride ?? Prisma.DbNull,
      contractPriceYearlyCents: input.contractPriceYearlyCents ?? null,
      scheduledPlanId: null,
      stripeSubscriptionId: null,
      pastDueSince: null,
    };
    await this.prisma.client.subscription.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
    await this.audit.log({
      tenantId,
      actorUserId: auth.user.id,
      action: "admin.subscription_set",
      metadata: { ...input, limitsOverride: input.limitsOverride ?? null, featuresOverride: input.featuresOverride ?? null, stripeEnded } as Prisma.InputJsonValue,

    });
  }

  /** Monnaie de facturation d'un commerce (null = celle de son pays) ; l'abonnement en cours garde la sienne. */
  async setTenantCurrency(auth: AuthState, tenantId: string, currency: string | null) {
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw notFound("Entreprise");
    await this.prisma.client.tenantSettings.upsert({ where: { tenantId }, update: { billingCurrency: currency }, create: { tenantId, billingCurrency: currency } });
    await this.audit.log({ tenantId, actorUserId: auth.user.id, action: "admin.billing_currency_set", metadata: { currency } });
    return { currency: await this.pricing.tenantCurrency(tenantId) };
  }

  listPlans() {
    return this.prisma.client.subscriptionPlan.findMany({
      orderBy: { sortOrder: "asc" },
      include: { prices: { orderBy: { currency: "asc" } }, _count: { select: { subscriptions: true } } },
    });
  }

  /** Les prix envoyés remplacent ceux de leur monnaie ; une monnaie absente garde son prix. */
  async updatePlan(auth: AuthState, id: string, input: z.infer<typeof updatePlanSchema>) {
    const { prices, ...data } = input;
    const plan = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.subscriptionPlan.update({ where: { id }, data });
      for (const p of prices ?? []) {
        const values = { yearlyCents: p.yearlyCents, stripePriceId: p.stripePriceId || null };
        await tx.planPrice.upsert({ where: { planId_currency: { planId: id, currency: p.currency } }, update: values, create: { planId: id, currency: p.currency, ...values } });
      }
      return tx.subscriptionPlan.findUniqueOrThrow({ where: { id: updated.id }, include: { prices: { orderBy: { currency: "asc" } } } });
    });
    await this.audit.log({ actorUserId: auth.user.id, action: "admin.plan_updated", targetType: "plan", targetId: id, metadata: input as Prisma.InputJsonValue });
    return plan;
  }

  integrations() {
    return this.prisma.client.integrationConnection.findMany({
      orderBy: { createdAt: "desc" },
      include: { tenant: { select: { name: true, slug: true } }, syncLogs: { where: { status: "error" }, orderBy: { createdAt: "desc" }, take: 5 } },
    });
  }

  errors() {
    return this.prisma.client.errorLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  }

  /** Accès support limité : lecture seule, durée bornée, motif obligatoire, audité. */
  async startSupport(auth: AuthState, tenantId: string, input: z.infer<typeof supportAccessSchema>) {
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw notFound("Entreprise");
    const grant = await this.prisma.client.supportAccessGrant.create({
      data: { tenantId, superAdminId: auth.user.id, reason: input.reason, expiresAt: new Date(Date.now() + input.minutes * 60_000) },
    });
    await this.prisma.client.session.update({ where: { id: auth.sessionId }, data: { activeTenantId: tenantId, supportGrantId: grant.id } });
    await this.audit.log({ tenantId, actorUserId: auth.user.id, action: "admin.support_access_started", metadata: { reason: input.reason, minutes: input.minutes } });
    return { expiresAt: grant.expiresAt };
  }

  async endSupport(auth: AuthState) {
    if (!auth.supportGrantId) throw badRequest("no_support", "Aucun accès support en cours");
    await this.prisma.client.supportAccessGrant.update({ where: { id: auth.supportGrantId }, data: { revokedAt: new Date() } });
    await this.prisma.client.session.update({ where: { id: auth.sessionId }, data: { activeTenantId: null, supportGrantId: null } });
    await this.audit.log({ tenantId: auth.activeTenantId, actorUserId: auth.user.id, action: "admin.support_access_ended" });
  }
}
