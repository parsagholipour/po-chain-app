-- Shopify checkout for store sale-channel orders.
-- Additive and nullable throughout: existing tenants keep Stripe checkout until they opt in.

-- AlterTable
ALTER TABLE "ShopifyIntegration"
  ADD COLUMN "checkoutEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "checkoutCurrency" TEXT,
  ADD COLUMN "checkoutLastError" TEXT,
  ADD COLUMN "ordersPaidWebhookSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "PaymentAttempt"
  ADD COLUMN "correlationToken" TEXT,
  ADD COLUMN "providerMetadata" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_correlationToken_key" ON "PaymentAttempt"("correlationToken");

-- CreateIndex
CREATE INDEX "PaymentAttempt_provider_status_createdAt_idx" ON "PaymentAttempt"("provider", "status", "createdAt");
