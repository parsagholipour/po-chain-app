-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN "saleChannelId" UUID;

-- CreateIndex
CREATE INDEX "Warehouse_storeId_saleChannelId_idx" ON "Warehouse"("storeId", "saleChannelId");

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_saleChannelId_fkey" FOREIGN KEY ("saleChannelId") REFERENCES "SaleChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
