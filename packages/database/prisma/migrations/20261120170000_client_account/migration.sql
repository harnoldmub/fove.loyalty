-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "clientAccountId" UUID;

-- CreateTable
CREATE TABLE "ClientAccount" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "googleSub" TEXT,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "clientAccountId" UUID NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientLoginCode" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientAccount_email_key" ON "ClientAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAccount_googleSub_key" ON "ClientAccount"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "ClientSession_tokenHash_key" ON "ClientSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientSession_clientAccountId_idx" ON "ClientSession"("clientAccountId");

-- CreateIndex
CREATE INDEX "ClientLoginCode_email_createdAt_idx" ON "ClientLoginCode"("email", "createdAt");

-- CreateIndex
CREATE INDEX "ClientLoginCode_ip_createdAt_idx" ON "ClientLoginCode"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_clientAccountId_idx" ON "Customer"("clientAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_clientAccountId_key" ON "Customer"("tenantId", "clientAccountId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_clientAccountId_fkey" FOREIGN KEY ("clientAccountId") REFERENCES "ClientAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSession" ADD CONSTRAINT "ClientSession_clientAccountId_fkey" FOREIGN KEY ("clientAccountId") REFERENCES "ClientAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

