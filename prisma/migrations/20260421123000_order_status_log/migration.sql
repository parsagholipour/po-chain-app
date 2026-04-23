-- CreateTable
CREATE TABLE "OrderStatusLog" (
    "id" UUID NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "purchaseOrderId" UUID,
    "manufacturingOrderId" UUID,
    "shippingId" UUID,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,

    CONSTRAINT "OrderStatusLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderStatusLog_parent_check" CHECK (
      (CASE WHEN "purchaseOrderId" IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN "manufacturingOrderId" IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN "shippingId" IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);

-- CreateIndex
CREATE INDEX "OrderStatusLog_storeId_createdAt_idx" ON "OrderStatusLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusLog_storeId_purchaseOrderId_createdAt_idx" ON "OrderStatusLog"("storeId", "purchaseOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusLog_storeId_manufacturingOrderId_createdAt_idx" ON "OrderStatusLog"("storeId", "manufacturingOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusLog_storeId_shippingId_createdAt_idx" ON "OrderStatusLog"("storeId", "shippingId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderStatusLog" ADD CONSTRAINT "OrderStatusLog_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusLog" ADD CONSTRAINT "OrderStatusLog_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusLog" ADD CONSTRAINT "OrderStatusLog_shippingId_fkey" FOREIGN KEY ("shippingId") REFERENCES "Shipping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusLog" ADD CONSTRAINT "OrderStatusLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusLog" ADD CONSTRAINT "OrderStatusLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
