-- CreateTable
CREATE TABLE "InventoryFolder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryFolder_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "inventoryFolderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryFolder_tenantId_name_key" ON "InventoryFolder"("tenantId", "name");
CREATE INDEX "InventoryFolder_tenantId_idx" ON "InventoryFolder"("tenantId");
CREATE INDEX "ProductVariant_tenantId_inventoryFolderId_idx" ON "ProductVariant"("tenantId", "inventoryFolderId");

-- AddForeignKey
ALTER TABLE "InventoryFolder" ADD CONSTRAINT "InventoryFolder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_inventoryFolderId_fkey" FOREIGN KEY ("inventoryFolderId") REFERENCES "InventoryFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
