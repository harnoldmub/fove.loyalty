-- Double authentification des admins (application TOTP) et codes de secours (docs/securite.md).
ALTER TABLE "Session" ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN "totpFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totpLastStep" INTEGER,
ADD COLUMN "totpLockedUntil" TIMESTAMP(3),
ADD COLUMN "totpPendingSecret" TEXT,
ADD COLUMN "totpSecret" TEXT;

CREATE TABLE "UserRecoveryCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserRecoveryCode_userId_idx" ON "UserRecoveryCode"("userId");

ALTER TABLE "UserRecoveryCode" ADD CONSTRAINT "UserRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
