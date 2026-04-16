ALTER TABLE "PurchaseOrderLine"
ADD COLUMN "unitCost" DECIMAL(12, 2),
ADD COLUMN "unitPrice" DECIMAL(12, 2);

UPDATE "PurchaseOrderLine" pol
SET
  "unitCost" = p."cost",
  "unitPrice" = p."price"
FROM "Product" p
WHERE p."id" = pol."productId";
