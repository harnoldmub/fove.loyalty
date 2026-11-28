-- Code caisse : caisses, codes des collaborateurs, sessions de caisse, points à vérifier (docs/chantier-code-caisse.md).
-- AlterTable
ALTER TABLE "LoyaltyTransaction" ADD COLUMN     "registerDeviceId" UUID;

-- AlterTable
ALTER TABLE "RewardRedemption" ADD COLUMN     "registerDeviceId" UUID;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "registerActiveAt" TIMESTAMP(3),
ADD COLUMN     "registerDeviceId" UUID,
ADD COLUMN     "registerMembershipId" UUID;

-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN     "cashierPinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cashierPinHash" TEXT,
ADD COLUMN     "cashierPinLockedUntil" TIMESTAMP(3),
ADD COLUMN     "cashierPinSetAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "registerLockMinutes" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "RegisterDevice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "establishmentId" UUID,
    "name" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RegisterDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAlert" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,

    CONSTRAINT "TenantAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegisterDevice_tenantId_idx" ON "RegisterDevice"("tenantId");

-- CreateIndex
CREATE INDEX "TenantAlert_tenantId_resolvedAt_idx" ON "TenantAlert"("tenantId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAlert_tenantId_key_key" ON "TenantAlert"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "RegisterDevice" ADD CONSTRAINT "RegisterDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAlert" ADD CONSTRAINT "TenantAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


