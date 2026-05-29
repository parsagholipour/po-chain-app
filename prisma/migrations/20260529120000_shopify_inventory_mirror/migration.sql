CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "ShopifyLocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "shopifyLocationGid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fulfillsOnlineOrders" BOOLEAN,
    "hasActiveInventory" BOOLEAN,
    "shipsInventory" BOOLEAN,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopifyInventoryCount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "shopifyLocationId" UUID NOT NULL,
    "shopifyInventoryItemGid" TEXT,
    "shopifyInventoryLevelGid" TEXT,
    "shopifyInventoryItemTracked" BOOLEAN,
    "inventoryLevelActive" BOOLEAN,
    "onHand" INTEGER NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncTrigger" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyInventoryCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopifyInventoryMovement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "productId" UUID,
    "shopifyLocationId" UUID,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "shopifyLocationName" TEXT NOT NULL,
    "shopifyLocationGid" TEXT NOT NULL,
    "shopifyInventoryItemGid" TEXT,
    "shopifyInventoryLevelGid" TEXT,
    "previousOnHand" INTEGER,
    "newOnHand" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopifyInventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopifyLocation_storeId_shopifyLocationGid_key" ON "ShopifyLocation"("storeId", "shopifyLocationGid");
CREATE INDEX "ShopifyLocation_storeId_name_idx" ON "ShopifyLocation"("storeId", "name");
CREATE INDEX "ShopifyLocation_storeId_isActive_idx" ON "ShopifyLocation"("storeId", "isActive");
CREATE INDEX "ShopifyLocation_storeId_lastSeenAt_idx" ON "ShopifyLocation"("storeId", "lastSeenAt");

CREATE UNIQUE INDEX "ShopifyInventoryCount_productId_shopifyLocationId_key" ON "ShopifyInventoryCount"("productId", "shopifyLocationId");
CREATE INDEX "ShopifyInventoryCount_storeId_shopifyLocationId_idx" ON "ShopifyInventoryCount"("storeId", "shopifyLocationId");
CREATE INDEX "ShopifyInventoryCount_storeId_productId_idx" ON "ShopifyInventoryCount"("storeId", "productId");
CREATE INDEX "ShopifyInventoryCount_storeId_lastSyncedAt_idx" ON "ShopifyInventoryCount"("storeId", "lastSyncedAt");

CREATE INDEX "ShopifyInventoryMovement_storeId_observedAt_idx" ON "ShopifyInventoryMovement"("storeId", "observedAt");
CREATE INDEX "ShopifyInventoryMovement_storeId_productId_observedAt_idx" ON "ShopifyInventoryMovement"("storeId", "productId", "observedAt");
CREATE INDEX "ShopifyInventoryMovement_storeId_shopifyLocationId_observedAt_idx" ON "ShopifyInventoryMovement"("storeId", "shopifyLocationId", "observedAt");
CREATE INDEX "ShopifyInventoryMovement_storeId_syncRunId_idx" ON "ShopifyInventoryMovement"("storeId", "syncRunId");

ALTER TABLE "ShopifyLocation"
  ADD CONSTRAINT "ShopifyLocation_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShopifyInventoryCount"
  ADD CONSTRAINT "ShopifyInventoryCount_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShopifyInventoryCount"
  ADD CONSTRAINT "ShopifyInventoryCount_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShopifyInventoryCount"
  ADD CONSTRAINT "ShopifyInventoryCount_shopifyLocationId_fkey"
  FOREIGN KEY ("shopifyLocationId") REFERENCES "ShopifyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShopifyInventoryMovement"
  ADD CONSTRAINT "ShopifyInventoryMovement_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShopifyInventoryMovement"
  ADD CONSTRAINT "ShopifyInventoryMovement_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShopifyInventoryMovement"
  ADD CONSTRAINT "ShopifyInventoryMovement_shopifyLocationId_fkey"
  FOREIGN KEY ("shopifyLocationId") REFERENCES "ShopifyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
