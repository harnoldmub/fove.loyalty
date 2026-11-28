-- Cadeaux d'anniversaire (docs/chantier-relances-anniversaire.md, R4).
-- CreateTable
CREATE TABLE "BirthdayGift" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BirthdayGift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BirthdayGift_tenantId_validUntil_idx" ON "BirthdayGift"("tenantId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayGift_customerId_year_key" ON "BirthdayGift"("customerId", "year");

-- AddForeignKey
ALTER TABLE "BirthdayGift" ADD CONSTRAINT "BirthdayGift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirthdayGift" ADD CONSTRAINT "BirthdayGift_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


