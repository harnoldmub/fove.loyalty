-- Anniversaire saisi dans « Mes cartes », recopié sur les fiches des commerces.
ALTER TABLE "ClientAccount" ADD COLUMN "birthDay" INTEGER,
ADD COLUMN "birthMonth" INTEGER;
