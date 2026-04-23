-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PurchaseOrderType" NOT NULL DEFAULT 'distributor',
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'open',
    "documentKey" TEXT,
    "saleChannelId" UUID,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_storeId_type_status_idx" ON "PurchaseOrder"("storeId", "type", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_storeId_type_status_updatedAt_idx" ON "PurchaseOrder"("storeId", "type", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_storeId_number_idx" ON "PurchaseOrder"("storeId", "number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_storeId_saleChannelId_idx" ON "PurchaseOrder"("storeId", "saleChannelId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_storeId_createdAt_idx" ON "PurchaseOrder"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_saleChannelId_fkey" FOREIGN KEY ("saleChannelId") REFERENCES "SaleChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
