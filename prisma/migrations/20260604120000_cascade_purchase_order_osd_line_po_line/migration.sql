ALTER TABLE "PurchaseOrderOsdLine"
  DROP CONSTRAINT "PurchaseOrderOsdLine_purchaseOrderLineId_fkey";

ALTER TABLE "PurchaseOrderOsdLine"
  ADD CONSTRAINT "PurchaseOrderOsdLine_purchaseOrderLineId_fkey"
  FOREIGN KEY ("purchaseOrderLineId")
  REFERENCES "PurchaseOrderLine"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
