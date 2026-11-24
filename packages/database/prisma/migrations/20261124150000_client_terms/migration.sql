-- Acceptation des conditions du compte client FOVE
ALTER TABLE "ClientAccount" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN "termsVersion" TEXT;
