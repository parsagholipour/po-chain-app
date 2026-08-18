-- CreateIndex
CREATE INDEX "CjDropshipTxn_store_sku_area_observed_idx" ON "CjDropshippingInventoryTransaction"("storeId", "sku", "cjAreaId", "observedAt");
