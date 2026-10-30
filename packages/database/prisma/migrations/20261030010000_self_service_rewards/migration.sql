-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('GIFT', 'PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CONTACTED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lastVisitAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totalSpend" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalVisits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Reward" ADD COLUMN     "kind" "RewardKind" NOT NULL DEFAULT 'GIFT',
ADD COLUMN     "value" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "RewardRedemption" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(14,2),
ADD COLUMN     "purchaseAmount" DECIMAL(14,2),
ADD COLUMN     "rewardKind" "RewardKind" NOT NULL DEFAULT 'GIFT',
ADD COLUMN     "rewardValue" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorId" UUID,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "companyName" TEXT,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'WEBSITE',
    "status" "ContactStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerNote_tenantId_customerId_createdAt_idx" ON "CustomerNote"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerNote_tenantId_id_key" ON "CustomerNote"("tenantId", "id");

-- CreateIndex
CREATE INDEX "ContactMessage_status_createdAt_idx" ON "ContactMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_tenantId_lastVisitAt_idx" ON "Customer"("tenantId", "lastVisitAt");

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
