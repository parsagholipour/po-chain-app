-- CreateTable
CREATE TABLE "PurchaseOrderOsd" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "type" "PurchaseOrderOsdType" NOT NULL,
    "resolution" "PurchaseOrderOsdResolution" NOT NULL,
    "manufacturingOrderId" UUID,
    "manufacturerId" UUID,
    "documentKey" TEXT,
    "notes" TEXT,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "PurchaseOrderOsd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrderOsd_storeId_purchaseOrderId_idx" ON "PurchaseOrderOsd"("storeId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderOsd_storeId_createdAt_idx" ON "PurchaseOrderOsd"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderOsd_storeId_manufacturingOrderId_idx" ON "PurchaseOrderOsd"("storeId", "manufacturingOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderOsd_storeId_manufacturerId_idx" ON "PurchaseOrderOsd"("storeId", "manufacturerId");

-- AddForeignKey
ALTER TABLE "PurchaseOrderOsd" ADD CONSTRAINT "PurchaseOrderOsd_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderOsd" ADD CONSTRAINT "PurchaseOrderOsd_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderOsd" ADD CONSTRAINT "PurchaseOrderOsd_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderOsd" ADD CONSTRAINT "PurchaseOrderOsd_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderOsd" ADD CONSTRAINT "PurchaseOrderOsd_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
