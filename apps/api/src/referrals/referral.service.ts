import { Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";
import type { Prisma } from "@fove/database";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";
import { PlanService } from "../billing/plan.service";
import { stripeSecretKey } from "../config";

/** Récompense du parrain et remise du filleul (USD, en centimes). docs/chantier-parrainage.md */
export const REFERRAL_REWARD_CENTS = 2000;
/** Plafond absolu de gain par année civile ; sinon le prix annuel de l'offre du parrain s'il est plus bas. */
export const REFERRAL_YEARLY_CAP_CENTS = 20000;
/** Attente après le premier paiement annuel du filleul (remboursement ou résiliation possibles). */
export const REFERRAL_PENDING_DAYS = 14;
/** Durée de validité d'un crédit acquis. */
export const REFERRAL_CREDIT_YEARS = 3;

const DAY = 86_400_000;

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

/** Bornes de l'année civile (UTC) d'une date. */
function calendarYear(date: Date): { start: Date; end: Date } {
  const year = date.getUTCFullYear();
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

/**
 * Programme de parrainage entre commerçants (docs/chantier-parrainage.md).
 * - P1 : enregistrement du filleul à l'inscription.
 * - P2 : remise du filleul, attente de 14 jours, acquisition plafonnée, utilisation (le plus ancien
 *   d'abord), expiration ; solde client Stripe en mode Stripe, suivi interne dans tous les cas.
 */
@Injectable()
export class ReferralService {
  private readonly logger = new Logger("Referral");
  private readonly stripe: Stripe | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlanService,
  ) {
    const key = stripeSecretKey();
    this.stripe = key ? new Stripe(key) : null;
  }

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

  /**
   * Page « Parrainage » du commerçant : lien, gains, plafond de l'année, filleuls, et la remise
   * dont il bénéficie lui-même s'il a été parrainé. Lien absent si son offre n'inclut pas le parrainage.
   */
  async summary(tenantId: string, appUrl: string) {
    const db = this.prisma.client;
    const now = new Date();
    const [tenant, features, rewards, asReferee] = await Promise.all([
      db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { slug: true } }),
      this.plans.features(tenantId),
      db.referralReward.findMany({
        where: { referrerTenantId: tenantId },
        orderBy: { createdAt: "desc" },
        include: { referredTenant: { select: { name: true } } },
      }),
      db.referralReward.findUnique({ where: { referredTenantId: tenantId }, include: { referrerTenant: { select: { name: true } } } }),
    ]);
    const { start, end } = calendarYear(now);
    const earnedThisYear = rewards
      .filter((r) => (r.status === "EARNED" || r.status === "EXPIRED") && r.earnedAt && r.earnedAt >= start && r.earnedAt < end)
      .reduce((sum, r) => sum + r.creditAmountCents, 0);
    const cap = await this.yearlyCap(tenantId);
    const earned = rewards.filter((r) => r.status === "EARNED" || r.status === "EXPIRED");
    const available = rewards.filter((r) => r.status === "EARNED" && r.creditRemainingCents > 0);
    const nextExpiry = available.map((r) => r.expiresAt).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    return {
      available: features.referral,
      link: features.referral ? `${appUrl}/signup?ref=${tenant.slug}` : null,
      rewardCents: REFERRAL_REWARD_CENTS,
      currency: "USD",
      year: { year: start.getUTCFullYear(), capCents: cap, earnedCents: earnedThisYear, remainingCents: Math.max(0, cap - earnedThisYear) },
      credit: {
        earnedCents: earned.reduce((sum, r) => sum + r.creditAmountCents, 0),
        usedCents: rewards.reduce((sum, r) => sum + r.creditUsedCents, 0),
        availableCents: available.reduce((sum, r) => sum + r.creditRemainingCents, 0),
        pendingCount: rewards.filter((r) => r.status === "PENDING").length,
        nextExpiry,
      },
      referrals: rewards.map((r) => ({
        id: r.id,
        name: r.referredTenant.name,
        signedUpAt: r.createdAt,
        status: r.status,
        amountCents: r.creditAmountCents,
        pendingUntil: r.pendingUntil,
        earnedAt: r.earnedAt,
        expiresAt: r.expiresAt,
      })),
      asReferee:
        asReferee && !asReferee.refereeDiscountUsedAt && asReferee.status !== "CANCELLED"
          ? { referrerName: asReferee.referrerTenant.name, discountCents: asReferee.refereeDiscountCents }
          : null,
    };
  }

  // --- Remise du filleul -------------------------------------------------------

  /** Remise due au filleul sur sa première souscription annuelle (0 si déjà utilisée ou pas de parrainage). */
  async refereeDiscount(tenantId: string): Promise<number> {
    const referral = await this.prisma.client.referralReward.findUnique({ where: { referredTenantId: tenantId } });
    if (!referral || referral.refereeDiscountUsedAt || referral.status === "CANCELLED") return 0;
    return referral.refereeDiscountCents;
  }

  async markRefereeDiscountUsed(tenantId: string): Promise<void> {
    await this.prisma.client.referralReward.updateMany({ where: { referredTenantId: tenantId, refereeDiscountUsedAt: null }, data: { refereeDiscountUsedAt: new Date() } });
  }

  // --- Crédit du parrain -------------------------------------------------------

  /**
   * Premier paiement annuel du filleul : le crédit du parrain passe « en attente » 14 jours.
   * Même carte bancaire qu'un paiement du parrain : parrainage annulé (anti-abus).
   */
  async onPaymentConfirmed(payment: { id: string; tenantId: string; cardFingerprint?: string | null; confirmedAt?: Date | null }): Promise<void> {
    const db = this.prisma.client;
    const referral = await db.referralReward.findUnique({ where: { referredTenantId: payment.tenantId } });
    if (!referral || referral.status !== "SIGNED_UP") return;

    if (payment.cardFingerprint) {
      const sameCard = await db.payment.count({ where: { tenantId: referral.referrerTenantId, cardFingerprint: payment.cardFingerprint } });
      if (sameCard > 0) {
        await db.referralReward.update({ where: { id: referral.id }, data: { status: "CANCELLED", cancelReason: "same_card", triggerPaymentId: payment.id } });
        await this.audit.log({ tenantId: referral.referrerTenantId, action: "referral.cancelled", targetType: "referral", targetId: referral.id, metadata: { reason: "same_card" } });
        return;
      }
    }
    const paidAt = payment.confirmedAt ?? new Date();
    await db.referralReward.update({
      where: { id: referral.id },
      data: { status: "PENDING", triggerPaymentId: payment.id, pendingUntil: new Date(paidAt.getTime() + REFERRAL_PENDING_DAYS * DAY) },
    });
    await this.audit.log({ tenantId: referral.referrerTenantId, action: "referral.pending", targetType: "referral", targetId: referral.id });
  }

  /** Tâche planifiée : acquisition des crédits arrivés au bout de l'attente, puis expiration des anciens. */
  async processDue(now = new Date()): Promise<{ earned: number; capped: number; cancelled: number; expired: number }> {
    const db = this.prisma.client;
    const result = { earned: 0, capped: 0, cancelled: 0, expired: 0 };

    const due = await db.referralReward.findMany({ where: { status: "PENDING", pendingUntil: { lte: now } }, orderBy: { pendingUntil: "asc" }, take: 200 });
    for (const referral of due) {
      const outcome = await this.mature(referral.id, now);
      if (outcome === "EARNED") result.earned += 1;
      else if (outcome === "CANCELLED") result.cancelled += 1;
      else if (outcome) result.capped += 1;
    }

    const expiring = await db.referralReward.findMany({ where: { status: "EARNED", expiresAt: { lte: now } }, take: 200 });
    for (const referral of expiring) {
      await db.referralReward.update({ where: { id: referral.id }, data: { status: "EXPIRED", creditRemainingCents: 0 } });
      if (referral.creditRemainingCents > 0) await this.pushToStripe(referral.referrerTenantId, referral.creditRemainingCents, "Crédit de parrainage expiré");
      await this.audit.log({ tenantId: referral.referrerTenantId, action: "referral.expired", targetType: "referral", targetId: referral.id, metadata: { remainingCents: referral.creditRemainingCents } });
      result.expired += 1;
    }
    return result;
  }

  /** Fin de l'attente d'un parrainage : annulé, hors offre, hors plafond ou acquis. */
  private async mature(referralId: string, now: Date): Promise<"EARNED" | "CAPPED" | "NO_PLAN" | "CANCELLED" | null> {
    const db = this.prisma.client;
    const referral = await db.referralReward.findUniqueOrThrow({ where: { id: referralId } });
    if (referral.status !== "PENDING") return null;

    // Remboursement ou résiliation pendant l'attente.
    const payment = referral.triggerPaymentId ? await db.payment.findUnique({ where: { id: referral.triggerPaymentId } }) : null;
    const subscription = await db.subscription.findUnique({ where: { tenantId: referral.referredTenantId } });
    const refunded = !payment || payment.amountRefundedCents > 0 || payment.status !== "SUCCEEDED";
    const cancelled = !subscription || subscription.status === "CANCELED" || subscription.cancelAtPeriodEnd;
    if (refunded || cancelled) {
      await db.referralReward.update({ where: { id: referral.id }, data: { status: "CANCELLED", cancelReason: refunded ? "refunded" : "cancelled" } });
      await this.audit.log({ tenantId: referral.referrerTenantId, action: "referral.cancelled", targetType: "referral", targetId: referral.id, metadata: { reason: refunded ? "refunded" : "cancelled" } });
      return "CANCELLED";
    }

    // Parrain hors offre payante à la date d'acquisition.
    if (!(await this.plans.features(referral.referrerTenantId)).referral) {
      await db.referralReward.update({ where: { id: referral.id }, data: { status: "NO_PLAN", earnedAt: now } });
      return "NO_PLAN";
    }

    // Plafond de l'année civile : le plus petit de 200 USD ou du prix annuel de l'offre du parrain.
    const cap = await this.yearlyCap(referral.referrerTenantId);
    const { start, end } = calendarYear(now);
    const alreadyEarned = await db.referralReward.aggregate({
      where: { referrerTenantId: referral.referrerTenantId, status: { in: ["EARNED", "EXPIRED"] }, earnedAt: { gte: start, lt: end } },
      _sum: { creditAmountCents: true },
    });
    const amount = Math.min(REFERRAL_REWARD_CENTS, Math.max(0, cap - (alreadyEarned._sum.creditAmountCents ?? 0)));
    if (amount === 0) {
      await db.referralReward.update({ where: { id: referral.id }, data: { status: "CAPPED", earnedAt: now } });
      await this.audit.log({ tenantId: referral.referrerTenantId, action: "referral.capped", targetType: "referral", targetId: referral.id });
      return "CAPPED";
    }

    const expiresAt = new Date(now);
    expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + REFERRAL_CREDIT_YEARS);
    const stripeBalanceTxId = await this.pushToStripe(referral.referrerTenantId, -amount, "Crédit de parrainage FOVE");
    await db.referralReward.update({
      where: { id: referral.id },
      data: { status: "EARNED", earnedAt: now, expiresAt, creditAmountCents: amount, creditRemainingCents: amount, stripeBalanceTxId },
    });
    await this.audit.log({ tenantId: referral.referrerTenantId, action: "referral.earned", targetType: "referral", targetId: referral.id, metadata: { amountCents: amount } });
    return "EARNED";
  }

  /** Plafond annuel du parrain selon son offre (prix du contrat Sur-mesure s'il existe). */
  async yearlyCap(tenantId: string): Promise<number> {
    const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    const price = sub?.contractPriceYearlyCents ?? sub?.plan.priceYearlyCents ?? 0;
    return price > 0 ? Math.min(REFERRAL_YEARLY_CAP_CENTS, price) : REFERRAL_YEARLY_CAP_CENTS;
  }

  /** Crédit disponible du parrain (acquis, non utilisé, non expiré). */
  async availableCredit(tenantId: string): Promise<number> {
    const sum = await this.prisma.client.referralReward.aggregate({ where: { referrerTenantId: tenantId, status: "EARNED" }, _sum: { creditRemainingCents: true } });
    return sum._sum.creditRemainingCents ?? 0;
  }

  /**
   * Utilise jusqu'à `maxCents` de crédit sur une facture du parrain, le plus ancien d'abord.
   * Renvoie le montant utilisé. En mode Stripe, Stripe a déjà déduit le solde : on ne fait que suivre.
   */
  async consumeCredit(tenantId: string, maxCents: number, paymentId: string | null, db: Prisma.TransactionClient | PrismaService["client"] = this.prisma.client): Promise<number> {
    if (maxCents <= 0) return 0;
    const credits = await db.referralReward.findMany({
      where: { referrerTenantId: tenantId, status: "EARNED", creditRemainingCents: { gt: 0 } },
      orderBy: { earnedAt: "asc" },
    });
    let used = 0;
    for (const credit of credits) {
      if (used >= maxCents) break;
      const take = Math.min(credit.creditRemainingCents, maxCents - used);
      await db.referralReward.update({
        where: { id: credit.id },
        data: { creditRemainingCents: { decrement: take }, creditUsedCents: { increment: take } },
      });
      await db.referralCreditUse.create({ data: { rewardId: credit.id, tenantId, paymentId, amountCents: take } });
      used += take;
    }
    return used;
  }

  /**
   * Mouvement du solde client Stripe du parrain (négatif = crédit, déduit des prochaines factures).
   * Sans client Stripe (mode simulé, ou pas encore abonné via Stripe), le suivi reste interne.
   */
  private async pushToStripe(tenantId: string, amountCents: number, description: string): Promise<string | null> {
    if (!this.stripe) return null;
    const sub = await this.prisma.client.subscription.findUnique({ where: { tenantId }, select: { stripeCustomerId: true } });
    if (!sub?.stripeCustomerId) return null;
    try {
      const tx = await this.stripe.customers.createBalanceTransaction(sub.stripeCustomerId, { amount: amountCents, currency: "usd", description });
      return tx.id;
    } catch (error) {
      this.logger.error(`Solde Stripe non mis à jour pour ${tenantId} : ${(error as Error).message}`);
      return null;
    }
  }
}
