import { CardsService } from "../cards/cards.service";
import { Injectable } from "@nestjs/common";
import { createTenantSchema, establishmentSchema, updateTenantSchema } from "@fove/shared";
import type { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { conflict, forbidden, isUniqueViolation, notFound } from "../common/errors";
import type { AuthState, TenantContext } from "../common/context";
import { PlanService } from "../billing/plan.service";

export async function systemRoleId(prisma: PrismaService, key: string): Promise<string> {
  const role = await prisma.client.role.findFirst({ where: { tenantId: null, key, isSystem: true } });
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
    const { name, ...settings } = input;
    await this.prisma.client.$transaction(async (tx) => {
      if (name) await tx.tenant.update({ where: { id: ctx.tenantId }, data: { name } });
      await tx.tenantSettings.update({ where: { tenantId: ctx.tenantId }, data: settings });
    });
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
