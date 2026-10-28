CREATE TYPE "BillingDocumentType" AS ENUM ('SHIPPING_LABEL', 'INVOICE');

CREATE TABLE "BillingDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "BillingDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingDocument_tenantId_orderId_type_key" ON "BillingDocument"("tenantId", "orderId", "type");
CREATE INDEX "BillingDocument_tenantId_createdAt_idx" ON "BillingDocument"("tenantId", "createdAt");
CREATE INDEX "BillingDocument_tenantId_type_idx" ON "BillingDocument"("tenantId", "type");

ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
