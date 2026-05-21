-- Store-scoped payment provider credentials. Secret values are encrypted by
-- application code through pgcrypto before they are persisted.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "StorePaymentProviderSetting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "secretKeyEncrypted" TEXT,
    "webhookSecretEncrypted" TEXT,
    "secretKeyLast4" TEXT,
    "webhookSecretLast4" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "StorePaymentProviderSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorePaymentProviderSetting_storeId_provider_key" ON "StorePaymentProviderSetting"("storeId", "provider");
CREATE INDEX "StorePaymentProviderSetting_provider_enabled_idx" ON "StorePaymentProviderSetting"("provider", "enabled");
CREATE INDEX "StorePaymentProviderSetting_storeId_enabled_idx" ON "StorePaymentProviderSetting"("storeId", "enabled");

ALTER TABLE "StorePaymentProviderSetting"
  ADD CONSTRAINT "StorePaymentProviderSetting_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorePaymentProviderSetting"
  ADD CONSTRAINT "StorePaymentProviderSetting_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StorePaymentProviderSetting"
  ADD CONSTRAINT "StorePaymentProviderSetting_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "PurchaseOrder_invoiceId_key";
