-- Create store tables first so existing business rows can be backfilled safely.
CREATE TABLE "Store" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserStore" (
    "userId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStore_pkey" PRIMARY KEY ("userId","storeId")
);

CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");
CREATE INDEX "Store_name_idx" ON "Store"("name");
CREATE INDEX "UserStore_storeId_idx" ON "UserStore"("storeId");

INSERT INTO "Store" ("id", "slug", "name", "createdAt", "updatedAt")
VALUES (
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13',
    'arcane-fortress',
    'Arcane Fortress',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE
SET
    "name" = EXCLUDED."name",
    "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "Invoice" ADD COLUMN "storeId" UUID;
ALTER TABLE "LogisticsPartner" ADD COLUMN "storeId" UUID;
ALTER TABLE "Manufacturer" ADD COLUMN "storeId" UUID;
ALTER TABLE "ManufacturingOrder" ADD COLUMN "storeId" UUID;
ALTER TABLE "ManufacturingOrderManufacturer" ADD COLUMN "storeId" UUID;
ALTER TABLE "ManufacturingOrderPurchaseOrder" ADD COLUMN "storeId" UUID;
ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD COLUMN "storeId" UUID;
ALTER TABLE "ManufacturingOrderShipping" ADD COLUMN "storeId" UUID;
ALTER TABLE "Product" ADD COLUMN "storeId" UUID;
ALTER TABLE "PurchaseOrder" ADD COLUMN "storeId" UUID;
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "storeId" UUID;
ALTER TABLE "PurchaseOrderShipping" ADD COLUMN "storeId" UUID;
ALTER TABLE "SaleChannel" ADD COLUMN "storeId" UUID;
ALTER TABLE "Shipping" ADD COLUMN "storeId" UUID;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "Invoice"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "LogisticsPartner"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "Manufacturer"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "ManufacturingOrder"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "ManufacturingOrderManufacturer"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "ManufacturingOrderPurchaseOrder"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "ManufacturingOrderPurchaseOrderLine"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "ManufacturingOrderShipping"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "Product"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "PurchaseOrder"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "PurchaseOrderLine"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "PurchaseOrderShipping"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "SaleChannel"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
UPDATE "Shipping"
SET "storeId" = (SELECT "id" FROM "default_store")
WHERE "storeId" IS NULL;

WITH "default_store" AS (
    SELECT "id" FROM "Store" WHERE "slug" = 'arcane-fortress'
)
INSERT INTO "UserStore" ("userId", "storeId", "createdAt")
SELECT "User"."id", (SELECT "id" FROM "default_store"), CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId", "storeId") DO NOTHING;

ALTER TABLE "Invoice" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "LogisticsPartner" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Manufacturer" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ManufacturingOrder" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ManufacturingOrderManufacturer" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ManufacturingOrderPurchaseOrder" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "ManufacturingOrderShipping" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "PurchaseOrderShipping" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "SaleChannel" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Shipping" ALTER COLUMN "storeId" SET NOT NULL;

DROP INDEX "Invoice_invoiceNumber_key";
DROP INDEX "Product_sku_key";

CREATE INDEX "Invoice_storeId_createdAt_idx" ON "Invoice"("storeId", "createdAt");
CREATE UNIQUE INDEX "Invoice_storeId_invoiceNumber_key" ON "Invoice"("storeId", "invoiceNumber");
CREATE INDEX "LogisticsPartner_storeId_type_name_idx" ON "LogisticsPartner"("storeId", "type", "name");
CREATE INDEX "LogisticsPartner_storeId_createdAt_idx" ON "LogisticsPartner"("storeId", "createdAt");
CREATE INDEX "Manufacturer_storeId_name_idx" ON "Manufacturer"("storeId", "name");
CREATE INDEX "Manufacturer_storeId_createdAt_idx" ON "Manufacturer"("storeId", "createdAt");
CREATE INDEX "ManufacturingOrder_storeId_status_idx" ON "ManufacturingOrder"("storeId", "status");
CREATE INDEX "ManufacturingOrder_storeId_number_idx" ON "ManufacturingOrder"("storeId", "number");
CREATE INDEX "ManufacturingOrder_storeId_createdAt_idx" ON "ManufacturingOrder"("storeId", "createdAt");
CREATE INDEX "ManufacturingOrderManufacturer_storeId_manufacturerId_idx" ON "ManufacturingOrderManufacturer"("storeId", "manufacturerId");
CREATE INDEX "ManufacturingOrderManufacturer_storeId_invoiceId_idx" ON "ManufacturingOrderManufacturer"("storeId", "invoiceId");
CREATE INDEX "ManufacturingOrderPurchaseOrder_storeId_purchaseOrderId_idx" ON "ManufacturingOrderPurchaseOrder"("storeId", "purchaseOrderId");
CREATE INDEX "ManufacturingOrderPurchaseOrderLine_storeId_purchaseOrderLi_idx" ON "ManufacturingOrderPurchaseOrderLine"("storeId", "purchaseOrderLineId");
CREATE INDEX "ManufacturingOrderPurchaseOrderLine_storeId_manufacturerId_idx" ON "ManufacturingOrderPurchaseOrderLine"("storeId", "manufacturerId");
CREATE INDEX "ManufacturingOrderPurchaseOrderLine_storeId_createdAt_idx" ON "ManufacturingOrderPurchaseOrderLine"("storeId", "createdAt");
CREATE INDEX "ManufacturingOrderShipping_storeId_shippingId_idx" ON "ManufacturingOrderShipping"("storeId", "shippingId");
CREATE INDEX "Product_storeId_name_idx" ON "Product"("storeId", "name");
CREATE INDEX "Product_storeId_defaultManufacturerId_idx" ON "Product"("storeId", "defaultManufacturerId");
CREATE INDEX "Product_storeId_createdAt_idx" ON "Product"("storeId", "createdAt");
CREATE UNIQUE INDEX "Product_storeId_sku_key" ON "Product"("storeId", "sku");
CREATE INDEX "PurchaseOrder_storeId_type_status_idx" ON "PurchaseOrder"("storeId", "type", "status");
CREATE INDEX "PurchaseOrder_storeId_number_idx" ON "PurchaseOrder"("storeId", "number");
CREATE INDEX "PurchaseOrder_storeId_saleChannelId_idx" ON "PurchaseOrder"("storeId", "saleChannelId");
CREATE INDEX "PurchaseOrder_storeId_createdAt_idx" ON "PurchaseOrder"("storeId", "createdAt");
CREATE INDEX "PurchaseOrderLine_storeId_purchaseOrderId_idx" ON "PurchaseOrderLine"("storeId", "purchaseOrderId");
CREATE INDEX "PurchaseOrderLine_storeId_productId_idx" ON "PurchaseOrderLine"("storeId", "productId");
CREATE INDEX "PurchaseOrderLine_storeId_createdAt_idx" ON "PurchaseOrderLine"("storeId", "createdAt");
CREATE INDEX "PurchaseOrderShipping_storeId_shippingId_idx" ON "PurchaseOrderShipping"("storeId", "shippingId");
CREATE INDEX "SaleChannel_storeId_type_name_idx" ON "SaleChannel"("storeId", "type", "name");
CREATE INDEX "SaleChannel_storeId_createdAt_idx" ON "SaleChannel"("storeId", "createdAt");
CREATE INDEX "Shipping_storeId_type_status_idx" ON "Shipping"("storeId", "type", "status");
CREATE INDEX "Shipping_storeId_logisticsPartnerId_idx" ON "Shipping"("storeId", "logisticsPartnerId");
CREATE INDEX "Shipping_storeId_createdAt_idx" ON "Shipping"("storeId", "createdAt");

ALTER TABLE "UserStore" ADD CONSTRAINT "UserStore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserStore" ADD CONSTRAINT "UserStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Manufacturer" ADD CONSTRAINT "Manufacturer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleChannel" ADD CONSTRAINT "SaleChannel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOrderManufacturer" ADD CONSTRAINT "ManufacturingOrderManufacturer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOrderPurchaseOrder" ADD CONSTRAINT "ManufacturingOrderPurchaseOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogisticsPartner" ADD CONSTRAINT "LogisticsPartner_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipping" ADD CONSTRAINT "Shipping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOrderShipping" ADD CONSTRAINT "ManufacturingOrderShipping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderShipping" ADD CONSTRAINT "PurchaseOrderShipping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD CONSTRAINT "ManufacturingOrderPurchaseOrderLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
