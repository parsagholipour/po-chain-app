ALTER TABLE "ManufacturingOrderPurchaseOrderLine"
ADD COLUMN "cost" DECIMAL(12,2);

UPDATE "ManufacturingOrderPurchaseOrderLine" mol
SET "cost" = COALESCE(pol."unitCost", p."cost")
FROM "PurchaseOrderLine" pol
JOIN "Product" p ON p."id" = pol."productId"
WHERE mol."purchaseOrderLineId" = pol."id"
  AND mol."cost" IS NULL;
