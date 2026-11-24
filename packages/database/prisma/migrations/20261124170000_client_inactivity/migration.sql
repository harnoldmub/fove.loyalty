-- Suppression des comptes clients inactifs : dernière activité et email de prévenance
ALTER TABLE "ClientAccount" ADD COLUMN "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "inactivityWarnedAt" TIMESTAMP(3);

CREATE INDEX "ClientAccount_lastActiveAt_idx" ON "ClientAccount"("lastActiveAt");
