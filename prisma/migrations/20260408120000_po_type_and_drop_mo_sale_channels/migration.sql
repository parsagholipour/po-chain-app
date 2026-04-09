-- CreateEnum
CREATE TYPE "PurchaseOrderType" AS ENUM ('distributor', 'stock');

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "type" "PurchaseOrderType" NOT NULL DEFAULT 'distributor';

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "saleChannelId" DROP NOT NULL;

-- DropTable
DROP TABLE "ManufacturingOrderSaleChannel";
