UPDATE "Order"
SET "feeAmount" = 60.24
WHERE "channel" = 'SHOPIFY'::"Channel"
  AND "feeAmount" = 0;
