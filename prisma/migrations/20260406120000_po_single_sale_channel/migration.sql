-- Add single sale channel FK on PurchaseOrder; remove join table.

-- 1) New column (nullable until backfilled)
ALTER TABLE "PurchaseOrder" ADD COLUMN "saleChannelId" UUID;

-- 2) Backfill from existing pivot rows (one channel per PO when multiple existed)
UPDATE "PurchaseOrder" AS po
SET "saleChannelId" = sub."saleChannelId"
FROM (
  SELECT DISTINCT ON ("purchaseOrderId") "purchaseOrderId", "saleChannelId"
  FROM "PurchaseOrderSaleChannel"
  ORDER BY "purchaseOrderId", "saleChannelId"
) AS sub
WHERE sub."purchaseOrderId" = po."id";

-- 3) Any PO without a pivot row (should be rare): assign first sale channel
UPDATE "PurchaseOrder"
SET "saleChannelId" = (SELECT "id" FROM "SaleChannel" LIMIT 1)
WHERE "saleChannelId" IS NULL;

ALTER TABLE "PurchaseOrder" ALTER COLUMN "saleChannelId" SET NOT NULL;

-- 4) Drop join table
ALTER TABLE "PurchaseOrderSaleChannel" DROP CONSTRAINT IF EXISTS "PurchaseOrderSaleChannel_createdById_fkey";
ALTER TABLE "PurchaseOrderSaleChannel" DROP CONSTRAINT IF EXISTS "PurchaseOrderSaleChannel_purchaseOrderId_fkey";
ALTER TABLE "PurchaseOrderSaleChannel" DROP CONSTRAINT IF EXISTS "PurchaseOrderSaleChannel_saleChannelId_fkey";
DROP TABLE IF EXISTS "PurchaseOrderSaleChannel";

-- 5) FK from PO to SaleChannel
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_saleChannelId_fkey" FOREIGN KEY ("saleChannelId") REFERENCES "SaleChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
