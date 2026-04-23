-- CreateTable
CREATE TABLE "ManufacturingOrderPurchaseOrderLine" (
    "manufacturingOrderId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "manufacturerId" UUID NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrderPurchaseOrderLine_pkey" PRIMARY KEY ("manufacturingOrderId","purchaseOrderLineId")
);

-- CreateIndex
CREATE INDEX "ManufacturingOrderPurchaseOrderLine_storeId_purchaseOrderLi_idx" ON "ManufacturingOrderPurchaseOrderLine"("storeId", "purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderPurchaseOrderLine_storeId_manufacturerId_idx" ON "ManufacturingOrderPurchaseOrderLine"("storeId", "manufacturerId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderPurchaseOrderLine_storeId_createdAt_idx" ON "ManufacturingOrderPurchaseOrderLine"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ManufacturingOrderPurchaseOrderLine_storeId_verified_idx" ON "ManufacturingOrderPurchaseOrderLine"("storeId", "verified");

-- AddForeignKey
ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD CONSTRAINT "ManufacturingOrderPurchaseOrderLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD CONSTRAINT "ManufacturingOrderPurchaseOrderLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD CONSTRAINT "ManufacturingOrderPurchaseOrderLine_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD CONSTRAINT "ManufacturingOrderPurchaseOrderLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderPurchaseOrderLine" ADD CONSTRAINT "ManufacturingOrderPurchaseOrderLine_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
