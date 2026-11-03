import { Injectable } from "@nestjs/common";
import { DEFAULT_PLANS, resolveFeatures, resolveLimits, type PlanFeatures, type PlanLimits, type QuotaKey } from "@fove/shared";
import type { Prisma, Subscription, SubscriptionPlan } from "@fove/database";
import { PrismaService } from "../common/prisma.service";
import { paymentRequired } from "../common/errors";

export type { PlanFeatures, PlanLimits, QuotaKey };

const QUOTA_LABEL: Record<QuotaKey, string> = {
  customers: "clients",
  establishments: "établissements",
  staff: "collaborateurs",
  programs: "programmes",
};

/**
 * Lecture des droits de l'offre. Règle produit : un changement d'offre ne
 * supprime ni ne bloque jamais les cartes et opérations existantes ; les
 * quotas ne limitent que les nouvelles créations. Sans abonnement en vigueur
 * (résilié, essai expiré, paiement jamais abouti), les droits sont ceux de
 * l'offre Gratuite.
 */
@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaService) {}

  /** Offre Gratuite, recréée depuis le catalogue si elle a disparu de la base. */
  async freePlan(): Promise<SubscriptionPlan> {
    const plan = await this.prisma.client.subscriptionPlan.findFirst({ where: { kind: "FREE" }, orderBy: { sortOrder: "asc" } });
    if (plan) return plan;
    const { kind, features, limits, ...free } = DEFAULT_PLANS.find((p) => p.kind === "FREE")!;
    return this.prisma.client.subscriptionPlan.upsert({
      where: { code: free.code },
      update: { kind },
      create: { ...free, kind, features: { ...features }, limits: { ...limits } },
    });
  }

  /** Abonnement qui donne actuellement ses droits, ou null si l'entreprise relève du Gratuit. */
  private async effective(tenantId: string): Promise<(Subscription & { plan: SubscriptionPlan }) | null> {
    const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (!sub || sub.status === "CANCELED" || sub.status === "INCOMPLETE") return null;
    if (sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt < new Date()) return null;
    return sub;
  }

  async features(tenantId: string): Promise<PlanFeatures> {
    const sub = await this.effective(tenantId);
    if (sub) return resolveFeatures(sub.plan.features, sub.featuresOverride);
    return resolveFeatures((await this.freePlan()).features);
  }

  async limits(tenantId: string): Promise<PlanLimits> {
    const sub = await this.effective(tenantId);
    if (sub) return resolveLimits(sub.plan.limits, sub.limitsOverride);
    return resolveLimits((await this.freePlan()).limits);
  }

  async usage(tenantId: string): Promise<Record<QuotaKey, number>> {
    const db = this.prisma.client;
    const [customers, establishments, staff, programs] = await Promise.all([
      db.customer.count({ where: { tenantId, anonymizedAt: null } }),
      db.establishment.count({ where: { tenantId, active: true } }),
      db.tenantMembership.count({ where: { tenantId, status: "ACTIVE" } }),
      db.loyaltyProgram.count({ where: { tenantId, active: true } }),
    ]);
    return { customers, establishments, staff, programs };
  }

  async assertQuota(tenantId: string, key: QuotaKey, adding = 1): Promise<void> {
    const limit = (await this.limits(tenantId))[key];
    if (limit === null) return;
    const used = (await this.usage(tenantId))[key];
    if (used + adding > limit) {
      throw paymentRequired("quota_exceeded", `Limite de ${limit} ${QUOTA_LABEL[key]} atteinte pour votre offre`);
    }
  }

  /**
   * Contrôle du quota de clients dans la transaction qui crée le client. Le
   * verrou par entreprise sérialise les créations simultanées (QR affiché lors
   * d'un événement) : sans lui, chacune compterait avant que les autres
   * n'enregistrent et le quota serait dépassé.
   */
  async assertCustomerQuotaInTx(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const limit = (await this.limits(tenantId)).customers;
    if (limit === null) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quota:customers:${tenantId}`}, 0))`;
    const used = await tx.customer.count({ where: { tenantId, anonymizedAt: null } });
    if (used + 1 > limit) {
      throw paymentRequired("quota_exceeded", `Limite de ${limit} ${QUOTA_LABEL.customers} atteinte pour votre offre`);
    }
  }

  async assertFeature(tenantId: string, feature: keyof PlanFeatures): Promise<void> {
    if (!(await this.features(tenantId))[feature]) {
      throw paymentRequired("plan_feature_unavailable", "Cette fonction n'est pas incluse dans votre offre");
    }
  }
}
