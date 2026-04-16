-- AlterEnum
ALTER TYPE "ManufacturingOrderManufacturerStatus" ADD VALUE 'picked_up';

-- AlterTable
ALTER TABLE "ManufacturingOrderManufacturer" ADD COLUMN     "balance_document_key" TEXT,
ADD COLUMN     "balance_paid_amount" DECIMAL(12,2),
ADD COLUMN     "balance_paid_at" TIMESTAMP(3),
ADD COLUMN     "balance_ref_number" TEXT,
ADD COLUMN     "deposit_document_key" TEXT,
ADD COLUMN     "deposit_paid_amount" DECIMAL(12,2),
ADD COLUMN     "deposit_paid_at" TIMESTAMP(3),
ADD COLUMN     "deposit_ref_number" TEXT,
ADD COLUMN     "manufacturing_started_at" TIMESTAMP(3),
ADD COLUMN     "picked_up_at" TIMESTAMP(3),
ADD COLUMN     "ready_at" TIMESTAMP(3);

-- RenameForeignKey
ALTER TABLE "ManufacturingOrderManufacturingShipping" RENAME CONSTRAINT "ManufacturingOrderManufacturingShipping_manufacturingOrderId_fk" TO "ManufacturingOrderManufacturingShipping_manufacturingOrder_fkey";

-- RenameForeignKey
ALTER TABLE "ManufacturingOrderManufacturingShipping" RENAME CONSTRAINT "ManufacturingOrderManufacturingShipping_manufacturingShippingId" TO "ManufacturingOrderManufacturingShipping_manufacturingShipp_fkey";
