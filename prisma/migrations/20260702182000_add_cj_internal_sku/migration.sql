ALTER TABLE "CjDropshippingInventoryCount"
  ADD COLUMN "cjInternalSku" TEXT;

UPDATE "CjDropshippingInventoryCount"
SET "cjInternalSku" = "sku"
WHERE "cjInternalSku" IS NULL;

ALTER TABLE "CjDropshippingInventoryCount"
  ALTER COLUMN "cjInternalSku" SET NOT NULL;

CREATE INDEX "CjDropshippingInventoryCount_storeId_cjInternalSku_idx"
  ON "CjDropshippingInventoryCount"("storeId", "cjInternalSku");

ALTER TABLE "CjDropshippingInventoryTransaction"
  ADD COLUMN "cjInternalSku" TEXT;

UPDATE "CjDropshippingInventoryTransaction"
SET "cjInternalSku" = "sku"
WHERE "cjInternalSku" IS NULL;

ALTER TABLE "CjDropshippingInventoryTransaction"
  ALTER COLUMN "cjInternalSku" SET NOT NULL;

CREATE INDEX "CjDropshipTxn_storeId_cjInternalSku_observed_idx"
  ON "CjDropshippingInventoryTransaction"("storeId", "cjInternalSku", "observedAt");
