CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "CjDropshippingInventoryMovementType" AS ENUM ('initial', 'increase', 'decrease');

CREATE TABLE "CjDropshippingIntegration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKeyEncrypted" TEXT,
    "openId" TEXT,
    "accessTokenEncrypted" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenEncrypted" TEXT,
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "lastSyncedSkuCount" INTEGER NOT NULL DEFAULT 0,
    "lastMatchedSkuCount" INTEGER NOT NULL DEFAULT 0,
    "lastUnmatchedCjSkuCount" INTEGER NOT NULL DEFAULT 0,
    "lastUnmatchedLocalSkuCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedProductCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedInventoryCount" INTEGER NOT NULL DEFAULT 0,
    "lastMovementCount" INTEGER NOT NULL DEFAULT 0,
    "syncLockUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CjDropshippingIntegration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CjDropshippingInventoryCount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "productId" UUID,
    "sku" TEXT NOT NULL,
    "cjProductId" TEXT,
    "cjVariantId" TEXT,
    "cjProductName" TEXT,
    "cjAreaId" TEXT NOT NULL,
    "cjAreaEn" TEXT,
    "countryCode" TEXT,
    "countryNameEn" TEXT,
    "totalInventoryNum" INTEGER NOT NULL DEFAULT 0,
    "cjInventoryNum" INTEGER NOT NULL DEFAULT 0,
    "factoryInventoryNum" INTEGER NOT NULL DEFAULT 0,
    "stock" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncTrigger" TEXT NOT NULL,
    "lastSeenInRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CjDropshippingInventoryCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CjDropshippingInventoryTransaction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "productId" UUID,
    "productName" TEXT,
    "sku" TEXT NOT NULL,
    "cjProductId" TEXT,
    "cjVariantId" TEXT,
    "cjProductName" TEXT,
    "cjAreaId" TEXT NOT NULL,
    "cjAreaEn" TEXT,
    "countryCode" TEXT,
    "countryNameEn" TEXT,
    "previousTotalInventoryNum" INTEGER,
    "newTotalInventoryNum" INTEGER NOT NULL,
    "previousCjInventoryNum" INTEGER,
    "newCjInventoryNum" INTEGER NOT NULL,
    "previousFactoryInventoryNum" INTEGER,
    "newFactoryInventoryNum" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "movementType" "CjDropshippingInventoryMovementType" NOT NULL,
    "trigger" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CjDropshippingInventoryTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CjDropshippingIntegration_storeId_key" ON "CjDropshippingIntegration"("storeId");
CREATE INDEX "CjDropshippingIntegration_enabled_idx" ON "CjDropshippingIntegration"("enabled");
CREATE INDEX "CjDropshippingIntegration_syncLockUntil_idx" ON "CjDropshippingIntegration"("syncLockUntil");

CREATE UNIQUE INDEX "CjDropshippingInventoryCount_storeId_sku_cjAreaId_key" ON "CjDropshippingInventoryCount"("storeId", "sku", "cjAreaId");
CREATE INDEX "CjDropshippingInventoryCount_storeId_sku_idx" ON "CjDropshippingInventoryCount"("storeId", "sku");
CREATE INDEX "CjDropshippingInventoryCount_storeId_productId_idx" ON "CjDropshippingInventoryCount"("storeId", "productId");
CREATE INDEX "CjDropshippingInventoryCount_storeId_cjAreaId_idx" ON "CjDropshippingInventoryCount"("storeId", "cjAreaId");
CREATE INDEX "CjDropshippingInventoryCount_storeId_lastSyncedAt_idx" ON "CjDropshippingInventoryCount"("storeId", "lastSyncedAt");

CREATE INDEX "CjDropshippingInventoryTransaction_storeId_observedAt_idx" ON "CjDropshippingInventoryTransaction"("storeId", "observedAt");
CREATE INDEX "CjDropshippingInventoryTransaction_storeId_productId_observedAt_idx" ON "CjDropshippingInventoryTransaction"("storeId", "productId", "observedAt");
CREATE INDEX "CjDropshippingInventoryTransaction_storeId_sku_observedAt_idx" ON "CjDropshippingInventoryTransaction"("storeId", "sku", "observedAt");
CREATE INDEX "CjDropshippingInventoryTransaction_storeId_cjAreaId_observedAt_idx" ON "CjDropshippingInventoryTransaction"("storeId", "cjAreaId", "observedAt");
CREATE INDEX "CjDropshippingInventoryTransaction_storeId_syncRunId_idx" ON "CjDropshippingInventoryTransaction"("storeId", "syncRunId");
CREATE INDEX "CjDropshippingInventoryTransaction_storeId_movementType_idx" ON "CjDropshippingInventoryTransaction"("storeId", "movementType");

ALTER TABLE "CjDropshippingIntegration"
  ADD CONSTRAINT "CjDropshippingIntegration_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CjDropshippingInventoryCount"
  ADD CONSTRAINT "CjDropshippingInventoryCount_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CjDropshippingInventoryCount"
  ADD CONSTRAINT "CjDropshippingInventoryCount_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CjDropshippingInventoryTransaction"
  ADD CONSTRAINT "CjDropshippingInventoryTransaction_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CjDropshippingInventoryTransaction"
  ADD CONSTRAINT "CjDropshippingInventoryTransaction_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
