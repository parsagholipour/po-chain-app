-- CreateTable
CREATE TABLE "ManufacturingOrderPurchaseOrder" (
    "manufacturingOrderId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "storeId" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrderPurchaseOrder_pkey" PRIMARY KEY ("manufacturingOrderId","purchaseOrderId")
);

-- CreateIndex
CREATE INDEX "ManufacturingOrderPurchaseOrder_storeId_purchaseOrderId_idx" ON "ManufacturingOrderPurchaseOrder"("storeId", "purchaseOrderId");

-- AddForeignKey
ALTER TABLE "ManufacturingOrderPurchaseOrder" ADD CONSTRAINT "ManufacturingOrderPurchaseOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderPurchaseOrder" ADD CONSTRAINT "ManufacturingOrderPurchaseOrder_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderPurchaseOrder" ADD CONSTRAINT "ManufacturingOrderPurchaseOrder_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
