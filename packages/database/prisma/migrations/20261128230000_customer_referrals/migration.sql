-- Parrainage entre clients d'un commerce (docs/chantier-parrainage-clients.md).
-- CreateEnum
CREATE TYPE "CustomerReferralStatus" AS ENUM ('SIGNED_UP', 'REWARDED', 'CAPPED');

-- AlterTable
ALTER TABLE "LoyaltyAccount" ADD COLUMN     "referralCode" TEXT;

-- CreateTable
CREATE TABLE "CustomerReferralSettings" (
    "tenantId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "referrerStamps" INTEGER NOT NULL DEFAULT 2,
    "referrerPoints" INTEGER NOT NULL DEFAULT 50,
    "refereeStamps" INTEGER NOT NULL DEFAULT 1,
    "refereePoints" INTEGER NOT NULL DEFAULT 0,
    "monthlyCap" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerReferralSettings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "CustomerReferral" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "referrerAccountId" UUID NOT NULL,
    "referrerCustomerId" UUID NOT NULL,
    "refereeCustomerId" UUID NOT NULL,
    "refereeAccountId" UUID NOT NULL,
    "status" "CustomerReferralStatus" NOT NULL DEFAULT 'SIGNED_UP',
    "welcomeDelta" INTEGER,
    "rewardDelta" INTEGER,
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerReferral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerReferral_tenantId_referrerCustomerId_status_idx" ON "CustomerReferral"("tenantId", "referrerCustomerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReferral_tenantId_refereeCustomerId_key" ON "CustomerReferral"("tenantId", "refereeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_referralCode_key" ON "LoyaltyAccount"("referralCode");

-- AddForeignKey
ALTER TABLE "CustomerReferralSettings" ADD CONSTRAINT "CustomerReferralSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReferral" ADD CONSTRAINT "CustomerReferral_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


