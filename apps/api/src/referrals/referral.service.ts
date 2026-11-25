import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";

/** Récompense du parrain et remise du filleul (USD, en centimes). docs/chantier-parrainage.md */
export const REFERRAL_REWARD_CENTS = 2000;

export interface AttributionInput {
  partnerCode?: string;
  partnerClickedAt?: number;
  referrerSlug?: string;
  referrerClickedAt?: number;
}

/**
 * Un nouveau commerce ne récompense qu'une personne : le partenaire ou le parrain dont le lien a été
 * cliqué en premier. Un clic sans date (cookie antérieur à cette règle) compte comme le plus ancien ;
 * à égalité, le partenaire l'emporte (son contrat le rémunère).
 */
export function pickAttribution(input: AttributionInput): "partner" | "referral" | null {
  const partner = Boolean(input.partnerCode?.trim());
  const referral = Boolean(input.referrerSlug?.trim());
  if (!partner || !referral) return partner ? "partner" : referral ? "referral" : null;
  return (input.referrerClickedAt ?? 0) < (input.partnerClickedAt ?? 0) ? "referral" : "partner";
}

/**
 * Programme de parrainage entre commerçants. Lot P1 : enregistrement du filleul à l'inscription.
 * Les récompenses (paiement, attente de 14 jours, plafond, expiration) arrivent au lot P2.
 */
@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Enregistre le parrainage d'un commerce qui vient d'être créé (état « inscrit », aucun crédit).
   * Exclus : commerce inconnu, le commerce lui-même, et un parrain dont le créateur du filleul est
   * propriétaire (on ne se parraine pas soi-même).
   */
  async recordSignup(p: { referredTenantId: string; ownerUserId: string; referrerSlug: string; clickedAt?: number }): Promise<boolean> {
    const db = this.prisma.client;
    const referrer = await db.tenant.findUnique({ where: { slug: p.referrerSlug.trim().toLowerCase() }, select: { id: true } });
    if (!referrer || referrer.id === p.referredTenantId) return false;

    const sameOwner = await db.tenantMembership.count({
      where: { tenantId: referrer.id, userId: p.ownerUserId, status: "ACTIVE", role: { key: "OWNER" } },
    });
    if (sameOwner > 0) {
      await this.audit.log({ tenantId: referrer.id, actorUserId: p.ownerUserId, action: "referral.excluded", targetType: "tenant", targetId: p.referredTenantId, metadata: { reason: "same_owner" } });
      return false;
    }

    const clickedAt = p.clickedAt && p.clickedAt <= Date.now() ? new Date(p.clickedAt) : null;
    try {
      await db.referralReward.create({ data: { referrerTenantId: referrer.id, referredTenantId: p.referredTenantId, clickedAt, refereeDiscountCents: REFERRAL_REWARD_CENTS } });
    } catch {
      return false; // Déjà parrainé : un commerce n'a qu'un parrain.
    }
    await this.audit.log({ tenantId: referrer.id, actorUserId: p.ownerUserId, action: "tenant.referred", targetType: "tenant", targetId: p.referredTenantId });
    return true;
  }
}
