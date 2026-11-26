-- Les partenaires n'encaissent plus : le commerçant paie toujours FOVE directement
-- (décision du 26 novembre 2026, docs/chantier-encaissement-hors-ligne.md).

-- Frais d'encaissement d'une fonction retirée : supprimés avant la colonne qui les distingue.
DELETE FROM "PartnerCommission" WHERE "kind" = 'COLLECTION_FEE';

-- DropForeignKey
ALTER TABLE "PartnerCommission" DROP CONSTRAINT "PartnerCommission_statementId_fkey";

-- DropForeignKey
ALTER TABLE "PartnerStatement" DROP CONSTRAINT "PartnerStatement_partnerId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_collectorPartnerId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_statementId_fkey";

-- AlterTable
ALTER TABLE "Partner" DROP COLUMN "collectionCapEurCents",
DROP COLUMN "collectionEnabled";

-- AlterTable
ALTER TABLE "PartnerCommission" DROP COLUMN "kind",
DROP COLUMN "statementId";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "collectorPartnerId",
DROP COLUMN "disputeNote",
DROP COLUMN "disputeReportedAt",
DROP COLUMN "statementId";

-- Rapprochements proposés vers un relevé de partenaire : effacés.
UPDATE "BankStatementEntry" SET "suggestedType" = NULL, "suggestedId" = NULL, "amountMismatch" = false WHERE "suggestedType" = 'STATEMENT';

-- DropTable
DROP TABLE "PartnerStatement";

-- DropEnum
DROP TYPE "PartnerStatementStatus";
