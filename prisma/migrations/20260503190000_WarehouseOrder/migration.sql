-- CreateEnum
CREATE TYPE "WarehouseOrderStatus" AS ENUM ('open', 'shipped', 'closed');

-- AlterEnum
ALTER TYPE "ShippingType" ADD VALUE IF NOT EXISTS 'warehouse_order';

-- AlterTable
ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD COLUMN "quantity" INTEGER;

-- Backfill existing MO allocations to their current full source line quantity.
UPDATE "ManufacturingOrderPurchaseOrderLine" mol
SET "quantity" = pol."quantity"
FROM "PurchaseOrderLine" pol
WHERE mol."purchaseOrderLineId" = pol."id"
  AND mol."quantity" IS NULL;

ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ALTER COLUMN "quantity" SET NOT NULL;

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseOrder" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WarehouseOrderStatus" NOT NULL DEFAULT 'open',
    "documentKey" TEXT,
    "warehouseId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "WarehouseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseOrderPurchaseOrder" (
    "warehouseOrderId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "storeId" UUID NOT NULL,

    CONSTRAINT "WarehouseOrderPurchaseOrder_pkey" PRIMARY KEY ("warehouseOrderId","purchaseOrderId")
);

-- CreateTable
CREATE TABLE "WarehouseOrderShipping" (
    "warehouseOrderId" UUID NOT NULL,
    "shippingId" UUID NOT NULL,
    "storeId" UUID NOT NULL,

    CONSTRAINT "WarehouseOrderShipping_pkey" PRIMARY KEY ("warehouseOrderId","shippingId")
);

-- CreateTable
CREATE TABLE "WarehouseOrderPurchaseOrderLine" (
    "warehouseOrderId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "WarehouseOrderPurchaseOrderLine_pkey" PRIMARY KEY ("warehouseOrderId","purchaseOrderLineId")
);

-- AlterTable
ALTER TABLE "OrderStatusLog" ADD COLUMN "warehouseOrderId" UUID;

ALTER TABLE "OrderStatusLog" DROP CONSTRAINT IF EXISTS "OrderStatusLog_parent_check";

ALTER TABLE "OrderStatusLog" ADD CONSTRAINT "OrderStatusLog_parent_check" CHECK (
  (CASE WHEN "purchaseOrderId" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "manufacturingOrderId" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "warehouseOrderId" IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN "shippingId" IS NOT NULL THEN 1 ELSE 0 END) = 1
);

-- CreateIndex
CREATE INDEX "Warehouse_storeId_name_idx" ON "Warehouse"("storeId", "name");

-- CreateIndex
CREATE INDEX "Warehouse_storeId_createdAt_idx" ON "Warehouse"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseOrder_number_key" ON "WarehouseOrder"("number");

-- CreateIndex
CREATE INDEX "WarehouseOrder_storeId_status_idx" ON "WarehouseOrder"("storeId", "status");

-- CreateIndex
CREATE INDEX "WarehouseOrder_storeId_warehouseId_idx" ON "WarehouseOrder"("storeId", "warehouseId");

-- CreateIndex
CREATE INDEX "WarehouseOrder_storeId_number_idx" ON "WarehouseOrder"("storeId", "number");

-- CreateIndex
CREATE INDEX "WarehouseOrder_storeId_createdAt_idx" ON "WarehouseOrder"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "WarehouseOrderPurchaseOrder_storeId_purchaseOrderId_idx" ON "WarehouseOrderPurchaseOrder"("storeId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "WarehouseOrderShipping_storeId_shippingId_idx" ON "WarehouseOrderShipping"("storeId", "shippingId");

-- CreateIndex
CREATE INDEX "WarehouseOrderPurchaseOrderLine_storeId_purchaseOrderLin_idx" ON "WarehouseOrderPurchaseOrderLine"("storeId", "purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "WarehouseOrderPurchaseOrderLine_storeId_createdAt_idx" ON "WarehouseOrderPurchaseOrderLine"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusLog_storeId_warehouseOrderId_createdAt_idx" ON "OrderStatusLog"("storeId", "warehouseOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrder" ADD CONSTRAINT "WarehouseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrder" ADD CONSTRAINT "WarehouseOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrder" ADD CONSTRAINT "WarehouseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrderPurchaseOrder" ADD CONSTRAINT "WarehouseOrderPurchaseOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrderPurchaseOrder" ADD CONSTRAINT "WarehouseOrderPurchaseOrder_warehouseOrderId_fkey" FOREIGN KEY ("warehouseOrderId") REFERENCES "WarehouseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrderPurchaseOrder" ADD CONSTRAINT "WarehouseOrderPurchaseOrder_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrderShipping" ADD CONSTRAINT "WarehouseOrderShipping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrderShipping" ADD CONSTRAINT "WarehouseOrderShipping_warehouseOrderId_fkey" FOREIGN KEY ("warehouseOrderId") REFERENCES "WarehouseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrderShipping" ADD CONSTRAINT "WarehouseOrderShipping_shippingId_fkey" FOREIGN KEY ("shippingId") REFERENCES "Shipping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrderPurchaseOrderLine" ADD CONSTRAINT "WarehouseOrderPurchaseOrderLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrderPurchaseOrderLine" ADD CONSTRAINT "WarehouseOrderPurchaseOrderLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrderPurchaseOrderLine" ADD CONSTRAINT "WarehouseOrderPurchaseOrderLine_warehouseOrderId_fkey" FOREIGN KEY ("warehouseOrderId") REFERENCES "WarehouseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrderPurchaseOrderLine" ADD CONSTRAINT "WarehouseOrderPurchaseOrderLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusLog" ADD CONSTRAINT "OrderStatusLog_warehouseOrderId_fkey" FOREIGN KEY ("warehouseOrderId") REFERENCES "WarehouseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
