import { Injectable } from "@nestjs/common";
import type { Prisma } from "@fove/database";
import { z } from "zod";
import { computeCustomerSegment } from "@fove/shared";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { badRequest, notFound } from "../common/errors";
import type { AuthState } from "../common/context";
import { readAccessToken } from "../loyalty/cards";

export const updatePlanSchema = z.object({
  name: z.string().min(2).max(40).optional(),
  description: z.string().max(300).optional(),
  priceMonthlyCents: z.int().min(0).max(1_000_000).optional(),
  priceYearlyCents: z.int().min(0).max(10_000_000).optional(),
  stripePriceMonthlyId: z.string().max(100).nullable().optional(),
  stripePriceYearlyId: z.string().max(100).nullable().optional(),
  trialDays: z.int().min(0).max(90).optional(),
  features: z.object({ api: z.boolean(), widget: z.boolean(), integrations: z.boolean(), exports: z.boolean() }).optional(),
  limits: z
    .object({
      customers: z.int().min(1).nullable(),
      establishments: z.int().min(1).nullable(),
      staff: z.int().min(1).nullable(),
      programs: z.int().min(1).nullable(),
    })
    .optional(),
  active: z.boolean().optional(),
});

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
  ) {}

  async stats() {
    const db = this.prisma.client;
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [tenants, suspended, newTenants, subs, customers, accounts, transactions30d] = await Promise.all([
      db.tenant.count(),
      db.tenant.count({ where: { status: "SUSPENDED" } }),
      db.tenant.count({ where: { createdAt: { gte: since } } }),
      db.subscription.findMany({ include: { plan: true } }),
      db.customer.count({ where: { anonymizedAt: null } }),
      db.loyaltyAccount.count(),
      db.loyaltyTransaction.count({ where: { createdAt: { gte: since } } }),
    ]);
    const byStatus: Record<string, number> = {};
    const byPlan: Record<string, number> = {};
    let mrrCents = 0;
    for (const s of subs) {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
      if (s.status === "ACTIVE" || s.status === "PAST_DUE") {
        byPlan[s.plan.code] = (byPlan[s.plan.code] ?? 0) + 1;
        // Le MRR ne compte que les abonnements réellement facturés par Stripe.
        if (s.provider === "STRIPE") mrrCents += s.interval === "YEAR" ? Math.round(s.plan.priceYearlyCents / 12) : s.plan.priceMonthlyCents;
      }
    }
    return { tenants, suspended, newTenants30d: newTenants, subscriptionsByStatus: byStatus, activeByPlan: byPlan, mrrCents, customers, accounts, transactions30d };
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
        subscription: { include: { plan: { select: { code: true, name: true } } } },
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
        integrations: true,
        _count: { select: { customers: true, accounts: true, transactions: true, programs: true, establishments: true } },
      },
    });
    if (!tenant) throw notFound("Entreprise");

    const [audit, rawCustomers] = await Promise.all([
      this.prisma.client.auditLog.findMany({ where: { tenantId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.client.customer.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          accounts: {
            select: {
              id: true,
              cardNumber: true,
              balance: true,
              status: true,
              accessTokenEncrypted: true,
              program: { select: { name: true, mode: true, stampsTarget: true } },
            },
          },
        },
      }),
    ]);

    const customers = rawCustomers.map((c) => ({
      ...c,
      segment: computeCustomerSegment({
        totalVisits: c.totalVisits,
        totalSpend: c.totalSpend ? Number(c.totalSpend) : 0,
        lastVisitAt: c.lastVisitAt,
        createdAt: c.createdAt,
      }),
      accounts: c.accounts.map((a) => ({
        ...a,
        accessToken: readAccessToken(a.accessTokenEncrypted),
      })),
    }));

    return { ...tenant, audit, customers };
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

  async listAllCustomers(q?: string) {
    const where: Prisma.CustomerWhereInput = {};
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { email: { contains: q.toLowerCase() } },
        { tenant: { name: { contains: q, mode: "insensitive" } } },
      ];
    }
    const rows = await this.prisma.client.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        accounts: {
          select: {
            id: true,
            cardNumber: true,
            balance: true,
            status: true,
            accessTokenEncrypted: true,
            program: { select: { name: true, mode: true, stampsTarget: true } },
          },
        },
      },
    });
    return rows.map((c) => ({
      ...c,
      segment: computeCustomerSegment({
        totalVisits: c.totalVisits,
        totalSpend: c.totalSpend ? Number(c.totalSpend) : 0,
        lastVisitAt: c.lastVisitAt,
        createdAt: c.createdAt,
      }),
      accounts: c.accounts.map((a) => ({
        ...a,
        accessToken: readAccessToken(a.accessTokenEncrypted),
      })),
    }));
  }

  async setStatus(auth: AuthState, id: string, status: "ACTIVE" | "SUSPENDED", reason: string) {
    const { count } = await this.prisma.client.tenant.updateMany({
      where: { id },
      data: { status, suspendedAt: status === "SUSPENDED" ? new Date() : null, suspendedReason: status === "SUSPENDED" ? reason : null },
    });
    if (count === 0) throw notFound("Entreprise");
    await this.audit.log({ tenantId: id, actorUserId: auth.user.id, action: status === "SUSPENDED" ? "admin.tenant_suspended" : "admin.tenant_reactivated", metadata: { reason } });
  }

  async setSubscription(auth: AuthState, tenantId: string, planCode: string, status: "TRIALING" | "ACTIVE" | "CANCELED", trialDays?: number) {
    const plan = await this.prisma.client.subscriptionPlan.findUnique({ where: { code: planCode } });
    if (!plan) throw notFound("Offre");
    const trialEndsAt = status === "TRIALING" ? new Date(Date.now() + (trialDays ?? plan.trialDays) * 86_400_000) : null;
    await this.prisma.client.subscription.upsert({
      where: { tenantId },
      update: { planId: plan.id, status, trialEndsAt, provider: "MANUAL" },
      create: { tenantId, planId: plan.id, status, trialEndsAt, provider: "MANUAL" },
    });
    await this.audit.log({ tenantId, actorUserId: auth.user.id, action: "admin.subscription_set", metadata: { planCode, status } });
  }

  listPlans() {
    return this.prisma.client.subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: true } } } });
  }

  async updatePlan(auth: AuthState, id: string, input: z.infer<typeof updatePlanSchema>) {
    const plan = await this.prisma.client.subscriptionPlan.update({ where: { id }, data: input });
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
