-- CreateTable
CREATE TABLE "ClientDismissedCustomer" (
    "clientAccountId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientDismissedCustomer_pkey" PRIMARY KEY ("clientAccountId","customerId")
);

-- CreateIndex
CREATE INDEX "ClientDismissedCustomer_customerId_idx" ON "ClientDismissedCustomer"("customerId");

-- AddForeignKey
ALTER TABLE "ClientDismissedCustomer" ADD CONSTRAINT "ClientDismissedCustomer_clientAccountId_fkey" FOREIGN KEY ("clientAccountId") REFERENCES "ClientAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDismissedCustomer" ADD CONSTRAINT "ClientDismissedCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

