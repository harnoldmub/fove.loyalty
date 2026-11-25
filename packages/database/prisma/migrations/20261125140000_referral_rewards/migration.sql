-- Parrainage, lot P2 : empreinte de carte, solde Stripe, utilisations du crédit

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cardFingerprint" TEXT;

-- AlterTable
ALTER TABLE "ReferralReward" ADD COLUMN     "stripeBalanceTxId" TEXT;

-- CreateTable
CREATE TABLE "ReferralCreditUse" (
    "id" UUID NOT NULL,
    "rewardId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCreditUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferralCreditUse_tenantId_createdAt_idx" ON "ReferralCreditUse"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralCreditUse_rewardId_idx" ON "ReferralCreditUse"("rewardId");

-- AddForeignKey
ALTER TABLE "ReferralCreditUse" ADD CONSTRAINT "ReferralCreditUse_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "ReferralReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
