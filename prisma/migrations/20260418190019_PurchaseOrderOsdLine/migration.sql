-- CreateTable
CREATE TABLE "PurchaseOrderOsdLine" (
    "id" UUID NOT NULL,
    "osdId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderOsdLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrderOsdLine_storeId_osdId_idx" ON "PurchaseOrderOsdLine"("storeId", "osdId");

-- CreateIndex
CREATE INDEX "PurchaseOrderOsdLine_storeId_purchaseOrderLineId_idx" ON "PurchaseOrderOsdLine"("storeId", "purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderOsdLine_osdId_purchaseOrderLineId_key" ON "PurchaseOrderOsdLine"("osdId", "purchaseOrderLineId");

-- AddForeignKey
ALTER TABLE "PurchaseOrderOsdLine" ADD CONSTRAINT "PurchaseOrderOsdLine_osdId_fkey" FOREIGN KEY ("osdId") REFERENCES "PurchaseOrderOsd"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderOsdLine" ADD CONSTRAINT "PurchaseOrderOsdLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderOsdLine" ADD CONSTRAINT "PurchaseOrderOsdLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
