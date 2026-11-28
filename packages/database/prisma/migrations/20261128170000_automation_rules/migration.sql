-- Règles des relances automatiques et de l'anniversaire par commerce.
-- CreateEnum
CREATE TYPE "AutomationRuleKind" AS ENUM ('NEAR_REWARD', 'REWARD_WAITING', 'AT_RISK', 'DORMANT', 'BIRTHDAY');

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" "AutomationRuleKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "body" TEXT,
    "bonus" INTEGER,
    "giftLabel" TEXT,
    "daysBefore" INTEGER NOT NULL DEFAULT 3,
    "daysAfter" INTEGER NOT NULL DEFAULT 7,
    "dayTitle" TEXT,
    "dayBody" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRule_tenantId_kind_key" ON "AutomationRule"("tenantId", "kind");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


