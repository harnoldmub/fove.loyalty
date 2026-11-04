-- AlterEnum
ALTER TYPE "PartnerStatus" ADD VALUE 'PENDING';
ALTER TYPE "PartnerStatus" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "PartnerStatus" ADD VALUE 'APPROVED';
ALTER TYPE "PartnerStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "PartnerStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "minimumPayoutThresholdCents" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "networkSizeEstimate" TEXT,
ADD COLUMN     "partnerType" TEXT,
ADD COLUMN     "promotionStrategy" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "totalClicksCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalConversionsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "userId" UUID,
ADD COLUMN     "websiteUrl" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPartner" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PartnerClick" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerLead" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "country" TEXT,
    "sector" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "registeredTenantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcquisitionAttribution" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmCampaign" TEXT,
    "attributionSource" TEXT NOT NULL DEFAULT 'COOKIE',
    "firstPaymentAt" TIMESTAMP(3),
    "conversionStatus" TEXT NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcquisitionAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultCommissionRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    "cookieAttributionDays" INTEGER NOT NULL DEFAULT 30,
    "conversionWindowDays" INTEGER NOT NULL DEFAULT 90,
    "validationDelayDays" INTEGER NOT NULL DEFAULT 30,
    "minimumPayoutThresholdCents" INTEGER NOT NULL DEFAULT 5000,
    "firstPaymentOnly" BOOLEAN NOT NULL DEFAULT true,
    "autoApproveApplications" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerClick_partnerId_idx" ON "PartnerClick"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerClick_code_idx" ON "PartnerClick"("code");

-- CreateIndex
CREATE INDEX "PartnerLead_partnerId_idx" ON "PartnerLead"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "AcquisitionAttribution_tenantId_key" ON "AcquisitionAttribution"("tenantId");

-- CreateIndex
CREATE INDEX "AcquisitionAttribution_partnerId_idx" ON "AcquisitionAttribution"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_userId_key" ON "Partner"("userId");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerClick" ADD CONSTRAINT "PartnerClick_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLead" ADD CONSTRAINT "PartnerLead_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLead" ADD CONSTRAINT "PartnerLead_registeredTenantId_fkey" FOREIGN KEY ("registeredTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionAttribution" ADD CONSTRAINT "AcquisitionAttribution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionAttribution" ADD CONSTRAINT "AcquisitionAttribution_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
