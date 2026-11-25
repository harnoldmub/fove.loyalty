-- Prix dans plusieurs monnaies (docs/chantier-multi-devises.md).

-- CreateTable
CREATE TABLE "PlanPrice" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "yearlyCents" INTEGER NOT NULL,
    "stripePriceId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanPrice_planId_currency_key" ON "PlanPrice"("planId", "currency");

-- AddForeignKey
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les prix actuels (en dollars) et leurs tarifs Stripe sont conservés ; les autres
-- monnaies sont ajoutées au démarrage de l'API et par le seed (grille de @fove/shared).
INSERT INTO "PlanPrice" ("id", "planId", "currency", "yearlyCents", "stripePriceId", "updatedAt")
SELECT gen_random_uuid(), "id", 'USD', "priceYearlyCents", "stripePriceYearlyId", NOW()
FROM "SubscriptionPlan"
WHERE "kind" = 'PAID';

-- AlterTable
ALTER TABLE "SubscriptionPlan" DROP COLUMN "currency",
DROP COLUMN "priceMonthlyCents",
DROP COLUMN "priceYearlyCents",
DROP COLUMN "stripePriceMonthlyId",
DROP COLUMN "stripePriceYearlyId";

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "billingCurrency" TEXT;

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "currency" TEXT NOT NULL,
    "unitsPerEur" DECIMAL(18,6) NOT NULL,
    "updatedByEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("currency")
);
