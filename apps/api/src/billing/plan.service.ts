import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { paymentRequired } from "../common/errors";

export interface PlanFeatures {
  api: boolean;
  widget: boolean;
  integrations: boolean;
  exports: boolean;
}
export type QuotaKey = "customers" | "establishments" | "staff" | "programs";
export type PlanLimits = Record<QuotaKey, number | null>;

const FALLBACK_FEATURES: PlanFeatures = { api: false, widget: true, integrations: false, exports: true };
const FALLBACK_LIMITS: PlanLimits = { customers: 500, establishments: 1, staff: 3, programs: 1 };

const QUOTA_LABEL: Record<QuotaKey, string> = {
  customers: "clients",
  establishments: "établissements",
  staff: "collaborateurs",
  programs: "programmes",
};

/**
 * Lecture des droits de l'offre. Règle produit : un changement d'offre ne
 * supprime ni ne bloque jamais les cartes et opérations existantes ; les
 * quotas ne limitent que les nouvelles créations.
 */
@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaService) {}

  private async currentPlan(tenantId: string) {
    const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (!sub || sub.status === "CANCELED" || sub.status === "INCOMPLETE") return null;
    if (sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt < new Date()) return null;
    return sub.plan;
  }

  async features(tenantId: string): Promise<PlanFeatures> {
    const plan = await this.currentPlan(tenantId);
    return plan ? { ...FALLBACK_FEATURES, ...(plan.features as Partial<PlanFeatures>) } : FALLBACK_FEATURES;
  }

  async limits(tenantId: string): Promise<PlanLimits> {
    const plan = await this.currentPlan(tenantId);
    return plan ? { ...FALLBACK_LIMITS, ...(plan.limits as Partial<PlanLimits>) } : FALLBACK_LIMITS;
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

  async assertFeature(tenantId: string, feature: keyof PlanFeatures): Promise<void> {
    if (!(await this.features(tenantId))[feature]) {
      throw paymentRequired("plan_feature_unavailable", "Cette fonction n'est pas incluse dans votre offre");
    }
  }
}
