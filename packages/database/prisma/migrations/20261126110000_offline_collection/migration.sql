-- Encaissement hors ligne (docs/chantier-encaissement-hors-ligne.md).


-- CreateEnum
CREATE TYPE "PartnerStatementStatus" AS ENUM ('ISSUED', 'PAID', 'SETTLED');

-- AlterEnum
ALTER TYPE "BillingProvider" ADD VALUE 'OFFLINE';

-- AlterTable
ALTER TABLE "BankStatementEntry" ADD COLUMN     "amountMismatch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suggestedId" UUID,
ADD COLUMN     "suggestedType" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paymentReference" TEXT;

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "collectionCapEurCents" INTEGER NOT NULL DEFAULT 30000,
ADD COLUMN     "collectionEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PartnerCommission" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'ACQUISITION',
ADD COLUMN     "statementId" UUID;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "collectorPartnerId" UUID,
ADD COLUMN     "disputeNote" TEXT,
ADD COLUMN     "disputeReportedAt" TIMESTAMP(3),
ADD COLUMN     "proofUrl" TEXT,
ADD COLUMN     "receiptNumber" TEXT,
ADD COLUMN     "statementId" UUID;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "provisionalUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" UUID NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "bankName" TEXT,
    "iban" TEXT,
    "accountNumber" TEXT,
    "swift" TEXT,
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerStatement" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "collectedCents" INTEGER NOT NULL,
    "commissionsCents" INTEGER NOT NULL,
    "feesCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "status" "PartnerStatementStatus" NOT NULL DEFAULT 'ISSUED',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankAccount_country_active_idx" ON "BankAccount"("country", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerStatement_reference_key" ON "PartnerStatement"("reference");

-- CreateIndex
CREATE INDEX "PartnerStatement_status_dueAt_idx" ON "PartnerStatement"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerStatement_partnerId_periodStart_currency_key" ON "PartnerStatement"("partnerId", "periodStart", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentReference_key" ON "Invoice"("paymentReference");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectorPartnerId_fkey" FOREIGN KEY ("collectorPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "PartnerStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "PartnerStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerStatement" ADD CONSTRAINT "PartnerStatement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

