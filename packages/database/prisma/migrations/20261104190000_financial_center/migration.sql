-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ASSOCIATE', 'FINANCE_MANAGER', 'SUPPORT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'MANUAL', 'MOCK', 'BANK_TRANSFER', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('ACTIVE', 'PAUSED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'AVAILABLE', 'PAID', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('HOSTING', 'DATABASE', 'EMAILS', 'DOMAINS', 'SAAS', 'MARKETING', 'ADS', 'DEV', 'FREELANCE', 'BANK_FEES', 'LEGAL', 'OFFICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PLANNED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminRole" "AdminRole";

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "subscriptionId" UUID,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amountSubtotalCents" INTEGER NOT NULL,
    "amountTaxCents" INTEGER NOT NULL DEFAULT 0,
    "amountDiscountCents" INTEGER NOT NULL DEFAULT 0,
    "amountTotalCents" INTEGER NOT NULL,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "amountDueCents" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "stripeInvoiceId" TEXT,
    "pdfUrl" TEXT,
    "hostedInvoiceUrl" TEXT,
    "billingReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountCents" INTEGER NOT NULL,
    "amountSubtotalCents" INTEGER NOT NULL,
    "amountTaxCents" INTEGER NOT NULL DEFAULT 0,
    "amountTotalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "planId" UUID,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "providerPaymentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "amountRefundedCents" INTEGER NOT NULL DEFAULT 0,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "partnerId" UUID,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "providerRefundId" TEXT,
    "initiatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "commissionRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    "status" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "payoutInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCommission" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID,
    "invoiceId" UUID,
    "amountBaseCents" INTEGER NOT NULL,
    "commissionRatePercent" DECIMAL(5,2) NOT NULL,
    "commissionAmountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "payoutId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPayout" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "reference" TEXT,
    "proofFileUrl" TEXT,
    "approvedByUserId" UUID,
    "paidAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" UUID NOT NULL,
    "referrerTenantId" UUID NOT NULL,
    "referredTenantId" UUID NOT NULL,
    "creditAmountCents" INTEGER NOT NULL,
    "creditUsedCents" INTEGER NOT NULL DEFAULT 0,
    "creditRemainingCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringInterval" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PAID',
    "paymentMethod" TEXT,
    "proofUrl" TEXT,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementEntry" (
    "id" UUID NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciledType" TEXT,
    "reconciledId" UUID,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_createdAt_idx" ON "Invoice"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_tenantId_createdAt_idx" ON "Payment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_providerPaymentId_idx" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_email_key" ON "Partner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_code_key" ON "Partner"("code");

-- CreateIndex
CREATE INDEX "PartnerCommission_partnerId_idx" ON "PartnerCommission"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerCommission_tenantId_idx" ON "PartnerCommission"("tenantId");

-- CreateIndex
CREATE INDEX "PartnerPayout_partnerId_idx" ON "PartnerPayout"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_referrerTenantId_referredTenantId_key" ON "ReferralReward"("referrerTenantId", "referredTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_reference_key" ON "Expense"("reference");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");

-- CreateIndex
CREATE INDEX "BankStatementEntry_reconciled_idx" ON "BankStatementEntry"("reconciled");

-- CreateIndex
CREATE INDEX "BankStatementEntry_entryDate_idx" ON "BankStatementEntry"("entryDate");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_entityType_entityId_idx" ON "FinancialAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_createdAt_idx" ON "FinancialAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "PartnerPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayout" ADD CONSTRAINT "PartnerPayout_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referrerTenantId_fkey" FOREIGN KEY ("referrerTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referredTenantId_fkey" FOREIGN KEY ("referredTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

