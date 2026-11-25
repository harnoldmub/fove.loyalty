-- Programme de parrainage (docs/chantier-parrainage.md)

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('SIGNED_UP', 'PENDING', 'EARNED', 'CAPPED', 'NO_PLAN', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "ReferralReward" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "clickedAt" TIMESTAMP(3),
ADD COLUMN     "earnedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "pendingUntil" TIMESTAMP(3),
ADD COLUMN     "refereeDiscountCents" INTEGER NOT NULL DEFAULT 2000,
ADD COLUMN     "refereeDiscountUsedAt" TIMESTAMP(3),
ADD COLUMN     "triggerPaymentId" UUID,
ALTER COLUMN "creditAmountCents" SET DEFAULT 0,
ALTER COLUMN "creditRemainingCents" SET DEFAULT 0,
DROP COLUMN "status",
ADD COLUMN     "status" "ReferralStatus" NOT NULL DEFAULT 'SIGNED_UP';

-- CreateIndex
CREATE INDEX "ReferralReward_referrerTenantId_status_idx" ON "ReferralReward"("referrerTenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_referredTenantId_key" ON "ReferralReward"("referredTenantId");

-- Reprise : les parrainages existants repassent à « inscrit » (status recréé à SIGNED_UP),
-- crédits remis à zéro (ils n'ont jamais été appliqués à une facture).
UPDATE "ReferralReward" SET "creditAmountCents" = 0, "creditRemainingCents" = 0, "creditUsedCents" = 0;

-- Fonction d'offre « referral » : incluse dans les offres payantes et Sur-mesure, absente du Gratuit.
UPDATE "SubscriptionPlan" SET "features" = jsonb_set("features"::jsonb, '{referral}', 'true'::jsonb) WHERE "kind" IN ('PAID', 'CUSTOM');
UPDATE "SubscriptionPlan" SET "features" = jsonb_set("features"::jsonb, '{referral}', 'false'::jsonb) WHERE "kind" = 'FREE';
