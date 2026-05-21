-- Back purchase orders are operational PO records excluded from reporting until actualized.
ALTER TABLE "PurchaseOrder"
ADD COLUMN "isBackOrder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "actualizedPoId" UUID;

ALTER TABLE "DraftPurchaseOrder"
ADD COLUMN "isBackOrder" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX IF EXISTS "DraftPurchaseOrder_invoiceId_destinationKey_key";
CREATE UNIQUE INDEX "DraftPurchaseOrder_invoiceId_destinationKey_isBackOrder_key" ON "DraftPurchaseOrder"("invoiceId", "destinationKey", "isBackOrder");

CREATE UNIQUE INDEX "PurchaseOrder_actualizedPoId_key" ON "PurchaseOrder"("actualizedPoId");
CREATE INDEX "PurchaseOrder_storeId_type_isBackOrder_status_idx" ON "PurchaseOrder"("storeId", "type", "isBackOrder", "status");

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_actualizedPoId_fkey" FOREIGN KEY ("actualizedPoId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
