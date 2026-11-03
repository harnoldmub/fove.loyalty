-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('FREE', 'PAID', 'CUSTOM');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "contractPriceYearlyCents" INTEGER,
ADD COLUMN     "featuresOverride" JSONB,
ADD COLUMN     "limitsOverride" JSONB;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "kind" "PlanKind" NOT NULL DEFAULT 'PAID';

-- Offres existantes (toutes payantes) : nouvelles fonctions incluses. Les offres
-- Gratuit et Sur-mesure sont créées par le seed.
UPDATE "SubscriptionPlan"
SET "features" = "features" || '{"walletCampaigns": true, "whatsappAuto": true, "removeBranding": true}'::jsonb
WHERE "kind" = 'PAID';

-- RenameIndex (nom tronqué par PostgreSQL dans la migration apple_wallet_and_banners)
ALTER INDEX "AppleWalletRegistration_deviceLibraryIdentifier_serialNumber_ke" RENAME TO "AppleWalletRegistration_deviceLibraryIdentifier_serialNumbe_key";
