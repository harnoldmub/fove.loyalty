-- Relances automatiques et anniversaire, socle (docs/chantier-relances-anniversaire.md).
-- CreateEnum
CREATE TYPE "AutomationScenario" AS ENUM ('NEAR_REWARD', 'REWARD_WAITING', 'AT_RISK', 'DORMANT', 'BIRTHDAY_SOON', 'BIRTHDAY_DAY');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WALLET', 'EMAIL');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "birthDay" INTEGER,
ADD COLUMN     "birthMonth" INTEGER;

-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "LoyaltyAccount" ADD COLUMN     "passUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Cartes existantes : date de modification = dernière activité connue.
UPDATE "LoyaltyAccount" SET "passUpdatedAt" = "lastActivityAt";

-- CreateTable
CREATE TABLE "CustomerMessage" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "accountId" UUID,
    "scenario" "AutomationScenario" NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bonus" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerMessage_tenantId_sentAt_idx" ON "CustomerMessage"("tenantId", "sentAt");

-- CreateIndex
CREATE INDEX "CustomerMessage_customerId_sentAt_idx" ON "CustomerMessage"("customerId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMessage_tenantId_key_key" ON "CustomerMessage"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "CustomerMessage" ADD CONSTRAINT "CustomerMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMessage" ADD CONSTRAINT "CustomerMessage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


