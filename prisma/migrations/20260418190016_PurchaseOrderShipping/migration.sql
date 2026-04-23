-- CreateTable
CREATE TABLE "PurchaseOrderShipping" (
    "purchaseOrderId" UUID NOT NULL,
    "shippingId" UUID NOT NULL,
    "storeId" UUID NOT NULL,

    CONSTRAINT "PurchaseOrderShipping_pkey" PRIMARY KEY ("purchaseOrderId","shippingId")
);

-- CreateIndex
CREATE INDEX "PurchaseOrderShipping_storeId_shippingId_idx" ON "PurchaseOrderShipping"("storeId", "shippingId");

-- AddForeignKey
ALTER TABLE "PurchaseOrderShipping" ADD CONSTRAINT "PurchaseOrderShipping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderShipping" ADD CONSTRAINT "PurchaseOrderShipping_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderShipping" ADD CONSTRAINT "PurchaseOrderShipping_shippingId_fkey" FOREIGN KEY ("shippingId") REFERENCES "Shipping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
