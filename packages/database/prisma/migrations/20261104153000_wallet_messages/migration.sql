-- AlterTable
ALTER TABLE "LoyaltyAccount" ADD COLUMN "lastWalletMessageTitle" TEXT,
ADD COLUMN "lastWalletMessageBody" TEXT,
ADD COLUMN "lastWalletMessageAt" TIMESTAMP(3);
