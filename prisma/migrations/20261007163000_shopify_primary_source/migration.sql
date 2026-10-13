ALTER TABLE "Product" ADD COLUMN "shopifyId" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN "shopifyId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "sourceKey" TEXT;
CREATE UNIQUE INDEX "Product_shopifyId_key" ON "Product"("shopifyId");
CREATE UNIQUE INDEX "ProductVariant_shopifyId_key" ON "ProductVariant"("shopifyId");
CREATE UNIQUE INDEX "Customer_sourceKey_key" ON "Customer"("sourceKey");
CREATE TABLE "WebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "shopDomain" TEXT,
  "status" TEXT NOT NULL,
  "payload" JSONB,
  "error" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");
CREATE INDEX "WebhookEvent_provider_topic_receivedAt_idx" ON "WebhookEvent"("provider", "topic", "receivedAt");
