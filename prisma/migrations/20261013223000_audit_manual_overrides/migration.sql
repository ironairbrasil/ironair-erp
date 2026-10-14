ALTER TABLE "ProductVariant" ADD COLUMN "manualOverrides" JSONB;
ALTER TABLE "InventoryMovement" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'SYNC';
ALTER TABLE "InventoryMovement" ADD COLUMN "metadata" JSONB;
ALTER TABLE "Customer" ADD COLUMN "manualOverrides" JSONB;
ALTER TABLE "Order" ADD COLUMN "manualOverrides" JSONB;
ALTER TABLE "Order" ADD COLUMN "sourceSnapshot" JSONB;
ALTER TABLE "OrderItem" ADD COLUMN "manualOverrides" JSONB;

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "AuditLog_tenantId_entityType_entityId_createdAt_idx" ON "AuditLog"("tenantId", "entityType", "entityId", "createdAt");
CREATE INDEX "AuditLog_tenantId_action_createdAt_idx" ON "AuditLog"("tenantId", "action", "createdAt");
