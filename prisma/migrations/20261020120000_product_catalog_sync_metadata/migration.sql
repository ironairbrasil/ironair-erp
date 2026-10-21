-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant"
ADD COLUMN "source" "Channel",
ADD COLUMN "availableQuantity" INTEGER,
ADD COLUMN "fulfillment" TEXT,
ADD COLUMN "externalUrl" TEXT;
