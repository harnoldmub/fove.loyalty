-- AlterTable
ALTER TABLE "LoyaltyAccount" ADD COLUMN     "accessTokenEncrypted" TEXT;

-- AlterTable
ALTER TABLE "LoyaltyProgram" ADD COLUMN     "oneVisitPerDay" BOOLEAN NOT NULL DEFAULT false;

-- Registre de fidélité et journal d'audit immuables au niveau SQL : aucune
-- modification ni suppression de ligne, même par erreur applicative.
-- (TRUNCATE, réservé à l'administration de la base et aux tests, n'est pas concerné.)
CREATE OR REPLACE FUNCTION fove_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La table % est immuable : ajoutez une écriture compensatoire', TG_TABLE_NAME USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LoyaltyTransaction_immutable"
  BEFORE UPDATE OR DELETE ON "LoyaltyTransaction"
  FOR EACH ROW EXECUTE FUNCTION fove_forbid_mutation();

CREATE TRIGGER "AuditLog_immutable"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION fove_forbid_mutation();
