-- AlterEnum: add invoiced (transaction-safe vs ALTER TYPE ADD VALUE)
CREATE TYPE "PurchaseOrderStatus_new" AS ENUM ('open', 'in_transit', 'invoiced', 'closed');
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" TYPE "PurchaseOrderStatus_new" USING ("status"::text::"PurchaseOrderStatus_new");
ALTER TYPE "PurchaseOrderStatus" RENAME TO "PurchaseOrderStatus_old";
ALTER TYPE "PurchaseOrderStatus_new" RENAME TO "PurchaseOrderStatus";
DROP TYPE "PurchaseOrderStatus_old";
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" SET DEFAULT 'open'::"PurchaseOrderStatus";

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "invoiceId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_invoiceId_key" ON "PurchaseOrder"("invoiceId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_storeId_invoiceId_idx" ON "PurchaseOrder"("storeId", "invoiceId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
