-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN "walletBannerUrl" TEXT,
ADD COLUMN "walletBannerVersion" TEXT,
ADD COLUMN "instagramHandle" TEXT;

-- CreateTable
CREATE TABLE "AppleWalletRegistration" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "deviceLibraryIdentifier" TEXT NOT NULL,
    "passTypeIdentifier" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleWalletRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppleWalletRegistration_deviceLibraryIdentifier_serialNumber_key" ON "AppleWalletRegistration"("deviceLibraryIdentifier", "serialNumber");

-- CreateIndex
CREATE INDEX "AppleWalletRegistration_serialNumber_idx" ON "AppleWalletRegistration"("serialNumber");

-- CreateIndex
CREATE INDEX "AppleWalletRegistration_passTypeIdentifier_idx" ON "AppleWalletRegistration"("passTypeIdentifier");

-- CreateIndex
CREATE INDEX "AppleWalletRegistration_tenantId_idx" ON "AppleWalletRegistration"("tenantId");

-- AddForeignKey
ALTER TABLE "AppleWalletRegistration" ADD CONSTRAINT "AppleWalletRegistration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

