-- Persist Shopify ProductVariant snapshots on local products, plus catalog webhook ids.

-- AlterTable
ALTER TABLE "ShopifyIntegration"
  ADD COLUMN "productsCreateWebhookSubscriptionId" TEXT,
  ADD COLUMN "productsUpdateWebhookSubscriptionId" TEXT,
  ADD COLUMN "productsDeleteWebhookSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "Product"
  ADD COLUMN "shopifyVariant" JSONB,
  ADD COLUMN "shopifyVariantGid" TEXT;

-- CreateIndex
CREATE INDEX "Product_storeId_shopifyVariantGid_idx" ON "Product"("storeId", "shopifyVariantGid");
