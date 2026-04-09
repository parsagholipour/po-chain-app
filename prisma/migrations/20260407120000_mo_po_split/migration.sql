-- MO / PO split: manufacturing workflow moves to ManufacturingOrder; PO gets 3-state lifecycle; POLine loses inline manufacturer.

-- 1) Enums: old PO order status becomes manufacturing order status
ALTER TYPE "PurchaseOrderStatus" RENAME TO "ManufacturingOrderStatus";

CREATE TYPE "PurchaseOrderStatus" AS ENUM ('open', 'in_transit', 'closed');

ALTER TYPE "PurchaseOrderManufacturerStatus" RENAME TO "ManufacturingOrderManufacturerStatus";

-- 2) PO distributor status (map old combined column before we drop it)
ALTER TABLE "PurchaseOrder" ADD COLUMN "distributorStatus" "PurchaseOrderStatus";

UPDATE "PurchaseOrder"
SET "distributorStatus" = CASE "status"::text
  WHEN 'open' THEN 'open'::"PurchaseOrderStatus"
  WHEN 'ready_to_ship' THEN 'in_transit'::"PurchaseOrderStatus"
  WHEN 'shipped' THEN 'in_transit'::"PurchaseOrderStatus"
  WHEN 'in_transit' THEN 'in_transit'::"PurchaseOrderStatus"
  ELSE 'closed'::"PurchaseOrderStatus"
END;

ALTER TABLE "PurchaseOrder" ALTER COLUMN "distributorStatus" SET NOT NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "distributorStatus" SET DEFAULT 'open'::"PurchaseOrderStatus";

-- 3) New tables
CREATE TABLE "ManufacturingOrder" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ManufacturingOrderStatus" NOT NULL DEFAULT 'open',
    "documentKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManufacturingOrder_number_key" ON "ManufacturingOrder"("number");

CREATE TABLE "ManufacturingOrderManufacturer" (
    "manufacturingOrderId" UUID NOT NULL,
    "manufacturerId" UUID NOT NULL,
    "status" "ManufacturingOrderManufacturerStatus" NOT NULL DEFAULT 'initial',
    "invoiceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrderManufacturer_pkey" PRIMARY KEY ("manufacturingOrderId","manufacturerId")
);

CREATE UNIQUE INDEX "ManufacturingOrderManufacturer_invoiceId_key" ON "ManufacturingOrderManufacturer"("invoiceId");

CREATE TABLE "ManufacturingOrderSaleChannel" (
    "manufacturingOrderId" UUID NOT NULL,
    "saleChannelId" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrderSaleChannel_pkey" PRIMARY KEY ("manufacturingOrderId","saleChannelId")
);

CREATE TABLE "ManufacturingOrderPurchaseOrder" (
    "manufacturingOrderId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrderPurchaseOrder_pkey" PRIMARY KEY ("manufacturingOrderId","purchaseOrderId")
);

CREATE TABLE "ManufacturingShipping" (
    "id" UUID NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "shippedAt" TIMESTAMP(3) NOT NULL,
    "invoiceDocumentKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "ManufacturingShipping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingOrderManufacturingShipping" (
    "manufacturingOrderId" UUID NOT NULL,
    "manufacturingShippingId" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrderManufacturingShipping_pkey" PRIMARY KEY ("manufacturingOrderId","manufacturingShippingId")
);

CREATE TABLE "ManufacturingOrderPurchaseOrderLine" (
    "manufacturingOrderId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "manufacturerId" UUID NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrderPurchaseOrderLine_pkey" PRIMARY KEY ("manufacturingOrderId","purchaseOrderLineId")
);

-- 4) FKs for new tables
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderManufacturer" ADD CONSTRAINT "ManufacturingOrderManufacturer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderManufacturer" ADD CONSTRAINT "ManufacturingOrderManufacturer_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderManufacturer" ADD CONSTRAINT "ManufacturingOrderManufacturer_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderManufacturer" ADD CONSTRAINT "ManufacturingOrderManufacturer_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderSaleChannel" ADD CONSTRAINT "ManufacturingOrderSaleChannel_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderSaleChannel" ADD CONSTRAINT "ManufacturingOrderSaleChannel_saleChannelId_fkey" FOREIGN KEY ("saleChannelId") REFERENCES "SaleChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderPurchaseOrder" ADD CONSTRAINT "ManufacturingOrderPurchaseOrder_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderPurchaseOrder" ADD CONSTRAINT "ManufacturingOrderPurchaseOrder_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingShipping" ADD CONSTRAINT "ManufacturingShipping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderManufacturingShipping" ADD CONSTRAINT "ManufacturingOrderManufacturingShipping_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderManufacturingShipping" ADD CONSTRAINT "ManufacturingOrderManufacturingShipping_manufacturingShippingId_fkey" FOREIGN KEY ("manufacturingShippingId") REFERENCES "ManufacturingShipping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD CONSTRAINT "ManufacturingOrderPurchaseOrderLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD CONSTRAINT "ManufacturingOrderPurchaseOrderLine_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD CONSTRAINT "ManufacturingOrderPurchaseOrderLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD CONSTRAINT "ManufacturingOrderPurchaseOrderLine_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) Backfill: one MO per old PurchaseOrderManufacturer row
CREATE TEMP TABLE "_pom_mo_map" (
    "purchaseOrderId" UUID NOT NULL,
    "manufacturerId" UUID NOT NULL,
    "moId" UUID NOT NULL,
    PRIMARY KEY ("purchaseOrderId", "manufacturerId")
);

INSERT INTO "_pom_mo_map" ("purchaseOrderId", "manufacturerId", "moId")
SELECT "purchaseOrderId", "manufacturerId", gen_random_uuid()
FROM "PurchaseOrderManufacturer";

INSERT INTO "ManufacturingOrder" ("id", "name", "status", "documentKey", "createdAt", "updatedAt", "createdById")
SELECT
    map."moId",
    po."name" || ' · ' || m."name",
    po."status",
    po."documentKey",
    pom."createdAt",
    pom."updatedAt",
    pom."createdById"
FROM "PurchaseOrderManufacturer" pom
JOIN "_pom_mo_map" map ON map."purchaseOrderId" = pom."purchaseOrderId" AND map."manufacturerId" = pom."manufacturerId"
JOIN "PurchaseOrder" po ON po."id" = pom."purchaseOrderId"
JOIN "Manufacturer" m ON m."id" = pom."manufacturerId";

INSERT INTO "ManufacturingOrderManufacturer" ("manufacturingOrderId", "manufacturerId", "status", "invoiceId", "createdAt", "updatedAt", "createdById")
SELECT
    map."moId",
    pom."manufacturerId",
    pom."status",
    pom."invoiceId",
    pom."createdAt",
    pom."updatedAt",
    pom."createdById"
FROM "PurchaseOrderManufacturer" pom
JOIN "_pom_mo_map" map ON map."purchaseOrderId" = pom."purchaseOrderId" AND map."manufacturerId" = pom."manufacturerId";

INSERT INTO "ManufacturingOrderPurchaseOrder" ("manufacturingOrderId", "purchaseOrderId")
SELECT map."moId", pom."purchaseOrderId"
FROM "PurchaseOrderManufacturer" pom
JOIN "_pom_mo_map" map ON map."purchaseOrderId" = pom."purchaseOrderId" AND map."manufacturerId" = pom."manufacturerId";

INSERT INTO "ManufacturingOrderSaleChannel" ("manufacturingOrderId", "saleChannelId")
SELECT map."moId", po."saleChannelId"
FROM "_pom_mo_map" map
JOIN "PurchaseOrder" po ON po."id" = map."purchaseOrderId";

INSERT INTO "ManufacturingOrderPurchaseOrderLine" ("manufacturingOrderId", "purchaseOrderLineId", "manufacturerId", "verified", "createdAt", "updatedAt", "createdById")
SELECT
    map."moId",
    pl."id",
    pl."manufacturerId",
    false,
    pl."createdAt",
    pl."updatedAt",
    pl."createdById"
FROM "PurchaseOrderLine" pl
JOIN "PurchaseOrderManufacturer" pom ON pom."purchaseOrderId" = pl."purchaseOrderId" AND pom."manufacturerId" = pl."manufacturerId"
JOIN "_pom_mo_map" map ON map."purchaseOrderId" = pom."purchaseOrderId" AND map."manufacturerId" = pom."manufacturerId";

-- 6) Shipping -> ManufacturingShipping (reuse ids); link each shipment to one MO per PO (first by mo id)
INSERT INTO "ManufacturingShipping" ("id", "trackingNumber", "shippedAt", "invoiceDocumentKey", "createdAt", "updatedAt", "createdById")
SELECT "id", "trackingNumber", "shippedAt", "invoiceDocumentKey", "createdAt", "updatedAt", "createdById"
FROM "Shipping";

INSERT INTO "ManufacturingOrderManufacturingShipping" ("manufacturingOrderId", "manufacturingShippingId")
SELECT pick."moId", s."id"
FROM "Shipping" s
JOIN LATERAL (
    SELECT map."moId"
    FROM "_pom_mo_map" map
    WHERE map."purchaseOrderId" = s."purchaseOrderId"
    ORDER BY map."moId"
    LIMIT 1
) pick ON true;

-- 7) Drop old PO manufacturing / shipping
ALTER TABLE "Shipping" DROP CONSTRAINT IF EXISTS "Shipping_createdById_fkey";
ALTER TABLE "Shipping" DROP CONSTRAINT IF EXISTS "Shipping_purchaseOrderId_fkey";
DROP TABLE "Shipping";

ALTER TABLE "PurchaseOrderManufacturer" DROP CONSTRAINT IF EXISTS "PurchaseOrderManufacturer_createdById_fkey";
ALTER TABLE "PurchaseOrderManufacturer" DROP CONSTRAINT IF EXISTS "PurchaseOrderManufacturer_invoiceId_fkey";
ALTER TABLE "PurchaseOrderManufacturer" DROP CONSTRAINT IF EXISTS "PurchaseOrderManufacturer_manufacturerId_fkey";
ALTER TABLE "PurchaseOrderManufacturer" DROP CONSTRAINT IF EXISTS "PurchaseOrderManufacturer_purchaseOrderId_fkey";
DROP TABLE "PurchaseOrderManufacturer";

-- 8) POLine: remove manufacturer
ALTER TABLE "PurchaseOrderLine" DROP CONSTRAINT IF EXISTS "PurchaseOrderLine_manufacturerId_fkey";
ALTER TABLE "PurchaseOrderLine" DROP COLUMN "manufacturerId";

-- 9) PO: swap status column to distributor lifecycle
ALTER TABLE "PurchaseOrder" DROP COLUMN "status";
ALTER TABLE "PurchaseOrder" RENAME COLUMN "distributorStatus" TO "status";
