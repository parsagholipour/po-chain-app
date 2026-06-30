/*
  Warnings:

  - You are about to drop the column `manufacturerId` on the `PurchaseOrderOsd` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "PurchaseOrderOsd" DROP CONSTRAINT "PurchaseOrderOsd_manufacturerId_fkey";

-- DropIndex
DROP INDEX "PurchaseOrderOsd_storeId_manufacturerId_idx";

-- DropIndex
DROP INDEX "PurchaseOrderOsdLine_osdId_purchaseOrderLineId_key";

-- AlterTable
ALTER TABLE "AppSession" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CjDropshippingIntegration" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CjDropshippingInventoryCount" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CjDropshippingInventoryTransaction" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PurchaseOrderOsd" DROP COLUMN "manufacturerId";

-- AlterTable
ALTER TABLE "ShopifyInventoryCount" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ShopifyInventoryMovement" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ShopifyLocation" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StorePaymentProviderSetting" ALTER COLUMN "id" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "CjDropshippingInventoryTransaction_storeId_cjAreaId_observedAt_" RENAME TO "CjDropshippingInventoryTransaction_storeId_cjAreaId_observe_idx";

-- RenameIndex
ALTER INDEX "CjDropshippingInventoryTransaction_storeId_productId_observedAt" RENAME TO "CjDropshippingInventoryTransaction_storeId_productId_observ_idx";

-- RenameIndex
ALTER INDEX "ShopifyInventoryMovement_storeId_shopifyLocationId_observedAt_i" RENAME TO "ShopifyInventoryMovement_storeId_shopifyLocationId_observed_idx";

-- RenameIndex
ALTER INDEX "WarehouseOrderPurchaseOrderLine_storeId_purchaseOrderLin_idx" RENAME TO "WarehouseOrderPurchaseOrderLine_storeId_purchaseOrderLineId_idx";
