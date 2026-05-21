-- CreateTable
CREATE TABLE "ShopifyIntegration" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "accessTokenEncrypted" TEXT,
    "webhookSecretEncrypted" TEXT,
    "webhookSubscriptionId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "lastSyncedProductCount" INTEGER NOT NULL DEFAULT 0,
    "lastMatchedSkuCount" INTEGER NOT NULL DEFAULT 0,
    "lastUnmatchedLocalSkuCount" INTEGER NOT NULL DEFAULT 0,
    "syncLockUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyIntegration_storeId_key" ON "ShopifyIntegration"("storeId");

-- CreateIndex
CREATE INDEX "ShopifyIntegration_enabled_idx" ON "ShopifyIntegration"("enabled");

-- CreateIndex
CREATE INDEX "ShopifyIntegration_syncLockUntil_idx" ON "ShopifyIntegration"("syncLockUntil");

-- AddForeignKey
ALTER TABLE "ShopifyIntegration" ADD CONSTRAINT "ShopifyIntegration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
