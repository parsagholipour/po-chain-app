-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "orderedQuantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2),
    "unitPrice" DECIMAL(12,2),
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_storeId_purchaseOrderId_idx" ON "PurchaseOrderLine"("storeId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_storeId_productId_idx" ON "PurchaseOrderLine"("storeId", "productId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_storeId_createdAt_idx" ON "PurchaseOrderLine"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_storeId_missing_pricing_idx" ON "PurchaseOrderLine"("storeId") WHERE ("unitCost" IS NULL OR "unitPrice" IS NULL);

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
