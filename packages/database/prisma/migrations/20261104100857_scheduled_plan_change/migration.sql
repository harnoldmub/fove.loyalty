-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "scheduledPlanId" UUID;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_scheduledPlanId_fkey" FOREIGN KEY ("scheduledPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
