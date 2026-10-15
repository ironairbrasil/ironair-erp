ALTER TABLE "ReturnCase" ADD COLUMN "orderExternalId" TEXT;
CREATE INDEX "ReturnCase_tenantId_channel_orderExternalId_idx" ON "ReturnCase"("tenantId", "channel", "orderExternalId");
