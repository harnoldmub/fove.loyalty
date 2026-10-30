import { createHash } from "node:crypto";
import { CardsService } from "../cards/cards.service";
import { Injectable } from "@nestjs/common";
import {
  createTenantSchema,
  establishmentSchema,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  TENANT_ROLES,
  updateTenantSchema,
} from "@fove/shared";
import type { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { conflict, forbidden, isUniqueViolation, notFound } from "../common/errors";
import type { AuthState, TenantContext } from "../common/context";
import { PlanService } from "../billing/plan.service";

const ROLE_NAMES = { OWNER: "Propriétaire", MANAGER: "Manager", CASHIER: "Caissier", VIEWER: "Lecteur" } as const;

const DEFAULT_PLANS = [
  {
    code: "starter",
    name: "Essentiel",
    description: "Pour les petits commerces, salons et indépendants.",
    currency: "USD",
    priceMonthlyCents: 0,
    priceYearlyCents: 9900,
    features: { api: false, widget: true, integrations: false, exports: true },
    limits: { customers: 500, establishments: 1, staff: 3, programs: 1 },
    sortOrder: 1,
  },
  {
    code: "business",
    name: "Business",
    description: "Pour les boutiques qui veulent développer leur clientèle.",
    currency: "USD",
    priceMonthlyCents: 0,
    priceYearlyCents: 19900,
    features: { api: true, widget: true, integrations: true, exports: true },
    limits: { customers: 2000, establishments: 1, staff: 15, programs: 3 },
    sortOrder: 2,
  },
  {
    code: "premium",
    name: "Réseau",
    description: "Pour les enseignes qui gèrent plusieurs boutiques.",
    currency: "USD",
    priceMonthlyCents: 0,
    priceYearlyCents: 39900,
    features: { api: true, widget: true, integrations: true, exports: true },
    limits: { customers: 10000, establishments: 3, staff: null, programs: null },
    sortOrder: 3,
  },
];

export async function ensureSystemReferenceData(prisma: PrismaService): Promise<void> {
  for (const perm of PERMISSIONS) {
    await prisma.client.permission.upsert({ where: { key: perm }, update: {}, create: { key: perm, description: perm } });
  }
  for (const roleKey of TENANT_ROLES) {
    const hash = createHash("sha256").update(`role:${roleKey}`).digest("hex");
    const uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    await prisma.client.role.upsert({
      where: { id: uuid },
      update: { permissions: [...ROLE_PERMISSIONS[roleKey]], name: ROLE_NAMES[roleKey] },
      create: { id: uuid, key: roleKey, name: ROLE_NAMES[roleKey], permissions: [...ROLE_PERMISSIONS[roleKey]], isSystem: true },
    });
  }
  for (const plan of DEFAULT_PLANS) {
    await prisma.client.subscriptionPlan.upsert({ where: { code: plan.code }, update: {}, create: plan });
  }
}

export async function systemRoleId(prisma: PrismaService, key: string): Promise<string> {
  let role = await prisma.client.role.findFirst({ where: { tenantId: null, key, isSystem: true } });
  if (!role) {
    await ensureSystemReferenceData(prisma);
    role = await prisma.client.role.findFirst({ where: { tenantId: null, key, isSystem: true } });
  }
  if (!role) throw new Error(`Rôle système ${key} absent : lancer le seed`);
  return role.id;
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlanService,
    private readonly cards: CardsService,
  ) {}

  /** Crée l'entreprise, l'adhésion propriétaire, les réglages et l'essai gratuit. */
  async create(auth: AuthState, input: z.infer<typeof createTenantSchema>) {
    const ownerRoleId = await systemRoleId(this.prisma, "OWNER");
    const trialPlan = await this.prisma.client.subscriptionPlan.findFirst({
      where: { code: process.env.TRIAL_PLAN_CODE ?? "business", active: true },
    });
    try {
      const tenant = await this.prisma.client.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({ data: { name: input.name, slug: input.slug } });
        await tx.tenantSettings.create({
          data: {
            tenantId: tenant.id,
            primaryColor: input.primaryColor,
            country: input.country,
            currency: input.currency,
            timezone: input.timezone,
            contactEmail: auth.user.email,
          },
        });
        await tx.tenantMembership.create({ data: { tenantId: tenant.id, userId: auth.user.id, roleId: ownerRoleId } });
        if (trialPlan) {
          await tx.subscription.create({
            data: {
              tenantId: tenant.id,
              planId: trialPlan.id,
              status: "TRIALING",
              interval: "YEAR",
              provider: "MOCK",
              trialEndsAt: new Date(Date.now() + trialPlan.trialDays * 86_400_000),
            },
          });
        }
        await tx.session.update({ where: { id: auth.sessionId }, data: { activeTenantId: tenant.id, supportGrantId: null } });
        return tenant;
      });
      await this.audit.log({ tenantId: tenant.id, actorUserId: auth.user.id, action: "tenant.created", targetType: "tenant", targetId: tenant.id });
      return tenant;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("slug_taken", "Cette adresse est déjà prise, choisissez-en une autre");
      throw error;
    }
  }

  async current(ctx: TenantContext) {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: ctx.tenantId },
      include: { settings: true, subscription: { include: { plan: true } } },
    });
    if (!tenant) throw notFound("Entreprise");
    const [limits, usage, features] = await Promise.all([
      this.plans.limits(ctx.tenantId),
      this.plans.usage(ctx.tenantId),
      this.plans.features(ctx.tenantId),
    ]);
    return { ...tenant, limits, usage, features };
  }

  async update(ctx: TenantContext, input: z.infer<typeof updateTenantSchema>) {
    const { name, slug, ...settings } = input;
    try {
      await this.prisma.client.$transaction(async (tx) => {
        if (name || slug) {
          await tx.tenant.update({
            where: { id: ctx.tenantId },
            data: {
              ...(name ? { name } : {}),
              ...(slug ? { slug } : {}),
            },
          });
        }
        await tx.tenantSettings.update({ where: { tenantId: ctx.tenantId }, data: settings });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("slug_taken", "Ce sous-domaine est déjà pris, choisissez-en un autre");
      throw error;
    }
    await this.audit.forTenant(ctx, "tenant.updated", { type: "tenant", id: ctx.tenantId }, { fields: Object.keys(input) });
    await this.cards.refreshProgramWallet(ctx.tenantId);
    return this.current(ctx);
  }

  async completeOnboarding(ctx: TenantContext) {
    await this.prisma.client.tenantSettings.update({
      where: { tenantId: ctx.tenantId },
      data: { onboardingCompletedAt: new Date() },
    });
  }

  // --- Établissements --------------------------------------------------------

  listEstablishments(ctx: TenantContext) {
    return this.prisma.client.establishment.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } });
  }

  async createEstablishment(ctx: TenantContext, input: z.infer<typeof establishmentSchema>) {
    await this.plans.assertQuota(ctx.tenantId, "establishments");
    const est = await this.prisma.client.establishment.create({ data: { ...input, tenantId: ctx.tenantId } });
    await this.audit.forTenant(ctx, "establishment.created", { type: "establishment", id: est.id });
    return est;
  }

  async updateEstablishment(ctx: TenantContext, id: string, input: Partial<z.infer<typeof establishmentSchema>> & { active?: boolean }) {
    const { count } = await this.prisma.client.establishment.updateMany({ where: { id, tenantId: ctx.tenantId }, data: input });
    if (count === 0) throw notFound("Établissement");
    await this.audit.forTenant(ctx, "establishment.updated", { type: "establishment", id });
    return this.prisma.client.establishment.findFirst({ where: { id, tenantId: ctx.tenantId } });
  }
}

/** Vérifie qu'un collaborateur limité à certains établissements agit dans son périmètre. */
export function assertEstablishmentAccess(ctx: TenantContext, establishmentId: string | null): void {
  if (ctx.actor.type !== "user" || ctx.actor.establishmentIds === null) return;
  if (!establishmentId) throw forbidden("Précisez l'établissement de l'opération");
  if (!ctx.actor.establishmentIds.has(establishmentId)) throw forbidden("Établissement hors de votre périmètre");
}
