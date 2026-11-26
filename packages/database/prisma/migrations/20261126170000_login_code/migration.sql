-- Connexion par code, sans mot de passe (docs/chantier-connexion-otp.md).

-- DropForeignKey
ALTER TABLE "AuthToken" DROP CONSTRAINT "AuthToken_userId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "failedLoginCount",
DROP COLUMN "lockedUntil",
DROP COLUMN "passwordHash";

-- DropTable
DROP TABLE "AuthToken";

-- DropEnum
DROP TYPE "AuthTokenType";

-- CreateTable
CREATE TABLE "UserLoginCode" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserLoginCode_email_createdAt_idx" ON "UserLoginCode"("email", "createdAt");

-- CreateIndex
CREATE INDEX "UserLoginCode_ip_createdAt_idx" ON "UserLoginCode"("ip", "createdAt");
