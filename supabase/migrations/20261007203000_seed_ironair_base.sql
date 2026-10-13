-- Seed minimal operational records after the reset migration. No sales,
-- customers, tracking events, or ad spend are inserted here.
INSERT INTO "Product" ("id", "name", "active", "createdAt", "updatedAt")
VALUES ('ironair', 'Iron Air', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "active" = EXCLUDED."active",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ProductVariant" ("id", "productId", "sku", "name", "voltage", "salePrice", "unitCost", "safetyStock", "active")
VALUES
  ('variant-ironair-127v', 'ironair', 'IRON-AIR-127V', 'Iron Air 127V', '127V', 1499.00, 550.00, 12, true),
  ('variant-ironair-220v', 'ironair', 'IRON-AIR-220V', 'Iron Air 220V', '220V', 1499.00, 550.00, 7, true)
ON CONFLICT ("sku") DO UPDATE SET
  "productId" = EXCLUDED."productId",
  "name" = EXCLUDED."name",
  "voltage" = EXCLUDED."voltage",
  "salePrice" = EXCLUDED."salePrice",
  "unitCost" = EXCLUDED."unitCost",
  "safetyStock" = EXCLUDED."safetyStock",
  "active" = EXCLUDED."active";

INSERT INTO "Warehouse" ("id", "code", "name", "channel", "active")
VALUES
  ('warehouse-central', 'CENTRAL', 'Estoque Central', NULL, true),
  ('warehouse-amazon-fba', 'AMAZON_FBA', 'Amazon FBA', 'AMAZON', true),
  ('warehouse-ml-full', 'ML_FULL', 'Mercado Livre Full', 'MERCADO_LIVRE', true),
  ('warehouse-shopee', 'SHOPEE', 'Shopee', 'SHOPEE', true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "channel" = EXCLUDED."channel",
  "active" = EXCLUDED."active";

INSERT INTO "InventoryBalance" ("id", "variantId", "warehouseId", "onHand", "reserved", "updatedAt")
VALUES
  ('balance-127v-central', 'variant-ironair-127v', 'warehouse-central', 0, 0, CURRENT_TIMESTAMP),
  ('balance-127v-amazon-fba', 'variant-ironair-127v', 'warehouse-amazon-fba', 0, 0, CURRENT_TIMESTAMP),
  ('balance-127v-ml-full', 'variant-ironair-127v', 'warehouse-ml-full', 0, 0, CURRENT_TIMESTAMP),
  ('balance-127v-shopee', 'variant-ironair-127v', 'warehouse-shopee', 0, 0, CURRENT_TIMESTAMP),
  ('balance-220v-central', 'variant-ironair-220v', 'warehouse-central', 0, 0, CURRENT_TIMESTAMP),
  ('balance-220v-amazon-fba', 'variant-ironair-220v', 'warehouse-amazon-fba', 0, 0, CURRENT_TIMESTAMP),
  ('balance-220v-ml-full', 'variant-ironair-220v', 'warehouse-ml-full', 0, 0, CURRENT_TIMESTAMP),
  ('balance-220v-shopee', 'variant-ironair-220v', 'warehouse-shopee', 0, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("variantId", "warehouseId") DO UPDATE SET
  "onHand" = EXCLUDED."onHand",
  "reserved" = EXCLUDED."reserved",
  "updatedAt" = CURRENT_TIMESTAMP;
