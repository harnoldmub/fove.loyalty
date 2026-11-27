-- Le mobile money n'est pas proposé (projet futur) : retiré des moyens de paiement.
-- Un éventuel paiement de test saisi en mobile money devient un paiement saisi à la main (MANUAL).
UPDATE "Payment" SET "provider" = 'MANUAL' WHERE "provider" = 'MOBILE_MONEY';

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentProvider_new" AS ENUM ('STRIPE', 'MANUAL', 'MOCK', 'BANK_TRANSFER');
ALTER TABLE "public"."Payment" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "provider" TYPE "PaymentProvider_new" USING ("provider"::text::"PaymentProvider_new");
ALTER TYPE "PaymentProvider" RENAME TO "PaymentProvider_old";
ALTER TYPE "PaymentProvider_new" RENAME TO "PaymentProvider";
DROP TYPE "public"."PaymentProvider_old";
ALTER TABLE "Payment" ALTER COLUMN "provider" SET DEFAULT 'STRIPE';
COMMIT;
