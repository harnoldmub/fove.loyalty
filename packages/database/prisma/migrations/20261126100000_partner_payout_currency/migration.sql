-- Monnaie de versement des partenaires (docs/chantier-multi-devises.md, M6).

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "payoutCurrency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "PartnerCommission" ADD COLUMN     "fxRate" DECIMAL(18,8),
ADD COLUMN     "payoutAmountCents" INTEGER,
ADD COLUMN     "payoutCurrency" TEXT;

-- Commissions déjà disponibles ou versées : même monnaie, taux 1.
UPDATE "PartnerCommission" SET "payoutCurrency" = "currency", "payoutAmountCents" = "commissionAmountCents", "fxRate" = 1
WHERE "status" IN ('AVAILABLE', 'PAID');
