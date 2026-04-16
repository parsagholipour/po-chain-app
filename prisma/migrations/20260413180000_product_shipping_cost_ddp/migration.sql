-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "cost" DECIMAL(12,2),
ADD COLUMN     "price" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Shipping" ADD COLUMN     "cost" DECIMAL(12,2),
ADD COLUMN     "delivery_duties_paid" BOOLEAN NOT NULL DEFAULT false;
