DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntegrationMode') THEN
    CREATE TYPE "IntegrationMode" AS ENUM ('OAUTH', 'DEV_MANUAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MembershipRole') THEN
    CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Tenant" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");

INSERT INTO "Tenant" ("id", "slug", "name")
VALUES ('tenant_ironair_dev', 'iron-air-dev', 'Iron Air Brasil')
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name";

CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_tenantId_key" ON "Organization"("tenantId");
ALTER TABLE "Organization" DROP CONSTRAINT IF EXISTS "Organization_tenantId_fkey";
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Organization" ("id", "tenantId", "name")
VALUES ('org_ironair_dev', 'tenant_ironair_dev', 'Iron Air Brasil')
ON CONFLICT ("tenantId") DO UPDATE SET "name" = EXCLUDED."name";

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Membership" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "Membership_userId_idx" ON "Membership"("userId");
ALTER TABLE "Membership" DROP CONSTRAINT IF EXISTS "Membership_tenantId_fkey";
ALTER TABLE "Membership" DROP CONSTRAINT IF EXISTS "Membership_userId_fkey";
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "InventoryBalance" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Attribution" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "TrackingEvent" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AdSpendDaily" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "WebhookReceipt" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "WebhookEvent" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "Product" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "ProductVariant" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "Warehouse" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "InventoryBalance" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "InventoryMovement" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "Customer" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "Order" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "OrderItem" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "Attribution" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "TrackingEvent" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "AdSpendDaily" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "Expense" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "Integration" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "WebhookReceipt" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;
UPDATE "WebhookEvent" SET "tenantId" = 'tenant_ironair_dev' WHERE "tenantId" IS NULL;

ALTER TABLE "Product" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ProductVariant" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Warehouse" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "InventoryBalance" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "InventoryMovement" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Attribution" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "TrackingEvent" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AdSpendDaily" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Expense" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Integration" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "WebhookReceipt" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "WebhookEvent" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "mode" "IntegrationMode" NOT NULL DEFAULT 'DEV_MANUAL';
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "externalAccountId" TEXT;
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "shopDomain" TEXT;
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "accessTokenEncrypted" TEXT;
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "refreshTokenEncrypted" TEXT;
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "scopes" TEXT;
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "webhookSecretEncrypted" TEXT;
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "connectedAt" TIMESTAMP(3);
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "disconnectedAt" TIMESTAMP(3);
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "WebhookEvent" ADD COLUMN IF NOT EXISTS "integrationId" TEXT;

CREATE TABLE IF NOT EXISTS "IntegrationWebhook" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "callbackUrl" TEXT NOT NULL,
  "externalWebhookId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "lastRegisteredAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationWebhook_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "IntegrationWebhook" DROP CONSTRAINT IF EXISTS "IntegrationWebhook_tenantId_fkey";
ALTER TABLE "IntegrationWebhook" DROP CONSTRAINT IF EXISTS "IntegrationWebhook_integrationId_fkey";
ALTER TABLE "IntegrationWebhook" ADD CONSTRAINT "IntegrationWebhook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationWebhook" ADD CONSTRAINT "IntegrationWebhook_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Product_shopifyId_key') THEN DROP INDEX "Product_shopifyId_key"; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ProductVariant_shopifyId_key') THEN DROP INDEX "ProductVariant_shopifyId_key"; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ProductVariant_sku_key') THEN DROP INDEX "ProductVariant_sku_key"; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Warehouse_code_key') THEN DROP INDEX "Warehouse_code_key"; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'InventoryMovement_idempotencyKey_key') THEN DROP INDEX "InventoryMovement_idempotencyKey_key"; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Customer_sourceKey_key') THEN DROP INDEX "Customer_sourceKey_key"; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Order_channel_externalId_key') THEN DROP INDEX "Order_channel_externalId_key"; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'TrackingEvent_eventId_key') THEN DROP INDEX "TrackingEvent_eventId_key"; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'AdSpendDaily_platform_date_accountId_campaignId_adsetId_adId_key') THEN DROP INDEX "AdSpendDaily_platform_date_accountId_campaignId_adsetId_adId_key"; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Integration_provider_key') THEN DROP INDEX "Integration_provider_key"; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'WebhookReceipt_provider_eventId_key') THEN DROP INDEX "WebhookReceipt_provider_eventId_key"; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'WebhookEvent_provider_eventId_key') THEN DROP INDEX "WebhookEvent_provider_eventId_key"; END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_shopifyId_key" ON "Product"("tenantId", "shopifyId");
CREATE INDEX IF NOT EXISTS "Product_tenantId_active_idx" ON "Product"("tenantId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_tenantId_sku_key" ON "ProductVariant"("tenantId", "sku");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_tenantId_shopifyId_key" ON "ProductVariant"("tenantId", "shopifyId");
CREATE INDEX IF NOT EXISTS "ProductVariant_tenantId_productId_idx" ON "ProductVariant"("tenantId", "productId");
CREATE UNIQUE INDEX IF NOT EXISTS "Warehouse_tenantId_code_key" ON "Warehouse"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "Warehouse_tenantId_active_idx" ON "Warehouse"("tenantId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryBalance_tenantId_variantId_warehouseId_key" ON "InventoryBalance"("tenantId", "variantId", "warehouseId");
CREATE INDEX IF NOT EXISTS "InventoryBalance_tenantId_warehouseId_idx" ON "InventoryBalance"("tenantId", "warehouseId");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovement_tenantId_idempotencyKey_key" ON "InventoryMovement"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "InventoryMovement_tenantId_variantId_warehouseId_createdAt_idx" ON "InventoryMovement"("tenantId", "variantId", "warehouseId", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryMovement_tenantId_orderId_idx" ON "InventoryMovement"("tenantId", "orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_tenantId_sourceKey_key" ON "Customer"("tenantId", "sourceKey");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_externalId_idx" ON "Customer"("tenantId", "externalId");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_emailHash_idx" ON "Customer"("tenantId", "emailHash");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_tenantId_channel_externalId_key" ON "Order"("tenantId", "channel", "externalId");
CREATE INDEX IF NOT EXISTS "Order_tenantId_status_paidAt_idx" ON "Order"("tenantId", "status", "paidAt");
CREATE INDEX IF NOT EXISTS "Order_tenantId_channel_createdAt_idx" ON "Order"("tenantId", "channel", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderItem_tenantId_orderId_idx" ON "OrderItem"("tenantId", "orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_tenantId_sku_idx" ON "OrderItem"("tenantId", "sku");
CREATE INDEX IF NOT EXISTS "Attribution_tenantId_campaignId_idx" ON "Attribution"("tenantId", "campaignId");
CREATE INDEX IF NOT EXISTS "Attribution_tenantId_adId_idx" ON "Attribution"("tenantId", "adId");
CREATE INDEX IF NOT EXISTS "Attribution_tenantId_source_medium_idx" ON "Attribution"("tenantId", "source", "medium");
CREATE UNIQUE INDEX IF NOT EXISTS "TrackingEvent_tenantId_eventId_key" ON "TrackingEvent"("tenantId", "eventId");
CREATE INDEX IF NOT EXISTS "TrackingEvent_tenantId_occurredAt_idx" ON "TrackingEvent"("tenantId", "occurredAt");
CREATE INDEX IF NOT EXISTS "TrackingEvent_tenantId_sessionId_occurredAt_idx" ON "TrackingEvent"("tenantId", "sessionId", "occurredAt");
CREATE INDEX IF NOT EXISTS "TrackingEvent_tenantId_visitorId_occurredAt_idx" ON "TrackingEvent"("tenantId", "visitorId", "occurredAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AdSpendDaily_tenantId_platform_date_accountId_campaignId_adsetId_adId_key" ON "AdSpendDaily"("tenantId", "platform", "date", "accountId", "campaignId", "adsetId", "adId");
CREATE INDEX IF NOT EXISTS "AdSpendDaily_tenantId_date_platform_idx" ON "AdSpendDaily"("tenantId", "date", "platform");
CREATE INDEX IF NOT EXISTS "AdSpendDaily_tenantId_campaignId_date_idx" ON "AdSpendDaily"("tenantId", "campaignId", "date");
CREATE INDEX IF NOT EXISTS "Expense_tenantId_date_category_idx" ON "Expense"("tenantId", "date", "category");
CREATE UNIQUE INDEX IF NOT EXISTS "Integration_tenantId_provider_key" ON "Integration"("tenantId", "provider");
CREATE INDEX IF NOT EXISTS "Integration_tenantId_status_idx" ON "Integration"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Integration_provider_shopDomain_idx" ON "Integration"("provider", "shopDomain");
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationWebhook_integrationId_topic_key" ON "IntegrationWebhook"("integrationId", "topic");
CREATE INDEX IF NOT EXISTS "IntegrationWebhook_tenantId_provider_status_idx" ON "IntegrationWebhook"("tenantId", "provider", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookReceipt_tenantId_provider_eventId_key" ON "WebhookReceipt"("tenantId", "provider", "eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_tenantId_provider_eventId_key" ON "WebhookEvent"("tenantId", "provider", "eventId");
CREATE INDEX IF NOT EXISTS "WebhookEvent_tenantId_provider_topic_receivedAt_idx" ON "WebhookEvent"("tenantId", "provider", "topic", "receivedAt");

ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_tenantId_fkey";
ALTER TABLE "ProductVariant" DROP CONSTRAINT IF EXISTS "ProductVariant_tenantId_fkey";
ALTER TABLE "Warehouse" DROP CONSTRAINT IF EXISTS "Warehouse_tenantId_fkey";
ALTER TABLE "InventoryBalance" DROP CONSTRAINT IF EXISTS "InventoryBalance_tenantId_fkey";
ALTER TABLE "InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_tenantId_fkey";
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_tenantId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_tenantId_fkey";
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_tenantId_fkey";
ALTER TABLE "Attribution" DROP CONSTRAINT IF EXISTS "Attribution_tenantId_fkey";
ALTER TABLE "TrackingEvent" DROP CONSTRAINT IF EXISTS "TrackingEvent_tenantId_fkey";
ALTER TABLE "AdSpendDaily" DROP CONSTRAINT IF EXISTS "AdSpendDaily_tenantId_fkey";
ALTER TABLE "Expense" DROP CONSTRAINT IF EXISTS "Expense_tenantId_fkey";
ALTER TABLE "Integration" DROP CONSTRAINT IF EXISTS "Integration_tenantId_fkey";
ALTER TABLE "WebhookReceipt" DROP CONSTRAINT IF EXISTS "WebhookReceipt_tenantId_fkey";
ALTER TABLE "WebhookEvent" DROP CONSTRAINT IF EXISTS "WebhookEvent_tenantId_fkey";

ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdSpendDaily" ADD CONSTRAINT "AdSpendDaily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookReceipt" ADD CONSTRAINT "WebhookReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
