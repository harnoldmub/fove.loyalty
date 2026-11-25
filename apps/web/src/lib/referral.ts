/** Données de la page « Parrainage » (GET /api/app/referrals). */
export type ReferralStatus = "SIGNED_UP" | "PENDING" | "EARNED" | "CAPPED" | "NO_PLAN" | "CANCELLED" | "EXPIRED";

export interface ReferralSummary {
  available: boolean;
  link: string | null;
  rewardCents: number;
  currency: string;
  year: { year: number; capCents: number; earnedCents: number; remainingCents: number };
  credit: { earnedCents: number; usedCents: number; availableCents: number; pendingCount: number; nextExpiry: string | null };
  referrals: { id: string; name: string; signedUpAt: string; status: ReferralStatus; amountCents: number; pendingUntil: string | null; earnedAt: string | null; expiresAt: string | null }[];
  asReferee: { referrerName: string; discountCents: number } | null;
  partnerInvite?: "approaching" | "reached" | null;
}
