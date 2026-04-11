CREATE TYPE "ShippingType" AS ENUM ('manufacturing_order', 'purchase_order', 'stock_order');

CREATE TYPE "ShippingStatus" AS ENUM ('pending', 'in_transit', 'delivered', 'cancelled');

CREATE TYPE "LogisticsPartnerType" AS ENUM ('freight_forwarder', 'carrier');

CREATE TABLE "LogisticsPartner" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "logoKey" TEXT,
    "contactNumber" TEXT,
    "link" TEXT,
    "type" "LogisticsPartnerType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "LogisticsPartner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Shipping" (
    "id" UUID NOT NULL,
    "type" "ShippingType" NOT NULL,
    "status" "ShippingStatus" NOT NULL DEFAULT 'pending',
    "trackingNumber" TEXT NOT NULL,
    "shippedAt" TIMESTAMP(3),
    "trackingLink" TEXT,
    "notes" TEXT,
    "invoiceDocumentKey" TEXT,
    "logisticsPartnerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "Shipping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManufacturingOrderShipping" (
    "manufacturingOrderId" UUID NOT NULL,
    "shippingId" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrderShipping_pkey" PRIMARY KEY ("manufacturingOrderId","shippingId")
);

CREATE TABLE "PurchaseOrderShipping" (
    "purchaseOrderId" UUID NOT NULL,
    "shippingId" UUID NOT NULL,

    CONSTRAINT "PurchaseOrderShipping_pkey" PRIMARY KEY ("purchaseOrderId","shippingId")
);

ALTER TABLE "LogisticsPartner" ADD CONSTRAINT "LogisticsPartner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Shipping" ADD CONSTRAINT "Shipping_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Shipping" ADD CONSTRAINT "Shipping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderShipping" ADD CONSTRAINT "ManufacturingOrderShipping_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturingOrderShipping" ADD CONSTRAINT "ManufacturingOrderShipping_shippingId_fkey" FOREIGN KEY ("shippingId") REFERENCES "Shipping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderShipping" ADD CONSTRAINT "PurchaseOrderShipping_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderShipping" ADD CONSTRAINT "PurchaseOrderShipping_shippingId_fkey" FOREIGN KEY ("shippingId") REFERENCES "Shipping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Shipping" (
    "id",
    "type",
    "status",
    "trackingNumber",
    "shippedAt",
    "invoiceDocumentKey",
    "createdAt",
    "updatedAt",
    "createdById"
)
SELECT
    ms."id",
    'manufacturing_order'::"ShippingType",
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM "ManufacturingOrderManufacturingShipping" moms
            INNER JOIN "ManufacturingOrder" mo ON mo."id" = moms."manufacturingOrderId"
            WHERE moms."manufacturingShippingId" = ms."id"
              AND mo."status" = 'delivered'
        ) THEN 'delivered'::"ShippingStatus"
        WHEN EXISTS (
            SELECT 1
            FROM "ManufacturingOrderManufacturingShipping" moms
            INNER JOIN "ManufacturingOrder" mo ON mo."id" = moms."manufacturingOrderId"
            WHERE moms."manufacturingShippingId" = ms."id"
              AND mo."status" = 'in_transit'
        ) THEN 'in_transit'::"ShippingStatus"
        ELSE 'pending'::"ShippingStatus"
    END,
    ms."trackingNumber",
    ms."shippedAt",
    ms."invoiceDocumentKey",
    ms."createdAt",
    ms."updatedAt",
    ms."createdById"
FROM "ManufacturingShipping" ms;

INSERT INTO "ManufacturingOrderShipping" ("manufacturingOrderId", "shippingId")
SELECT "manufacturingOrderId", "manufacturingShippingId"
FROM "ManufacturingOrderManufacturingShipping";

UPDATE "ManufacturingOrder"
SET "status" = 'shipped'
WHERE "status" IN ('in_transit', 'delivered');

ALTER TABLE "ManufacturingOrder" ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "ManufacturingOrderStatus" RENAME TO "ManufacturingOrderStatus_old";

CREATE TYPE "ManufacturingOrderStatus" AS ENUM ('open', 'ready_to_ship', 'shipped', 'invoiced', 'paid', 'closed');

ALTER TABLE "ManufacturingOrder"
ALTER COLUMN "status" TYPE "ManufacturingOrderStatus"
USING ("status"::text::"ManufacturingOrderStatus");

ALTER TABLE "ManufacturingOrder" ALTER COLUMN "status" SET DEFAULT 'open'::"ManufacturingOrderStatus";

DROP TYPE "ManufacturingOrderStatus_old";

DROP TABLE "ManufacturingOrderManufacturingShipping";

DROP TABLE "ManufacturingShipping";
