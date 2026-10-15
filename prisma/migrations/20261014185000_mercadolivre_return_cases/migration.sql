CREATE TABLE "ReturnCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "claimId" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "orderAmount" DECIMAL(12,2),
    "refundAmount" DECIMAL(12,2),
    "sourceUrl" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReturnCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReturnCase_tenantId_channel_externalOrderId_key" ON "ReturnCase"("tenantId", "channel", "externalOrderId");
CREATE INDEX "ReturnCase_tenantId_channel_status_idx" ON "ReturnCase"("tenantId", "channel", "status");
ALTER TABLE "ReturnCase" ADD CONSTRAINT "ReturnCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
