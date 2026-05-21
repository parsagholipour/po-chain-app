-- Add SaleChannelType value for browser-session storefront ordering links.
ALTER TYPE "SaleChannelType" ADD VALUE IF NOT EXISTS 'store';

-- Store magic-link metadata. Raw tokens are never stored; only tokenHash is persisted.
CREATE TABLE "SaleChannelMagicLink" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "saleChannelId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,

    CONSTRAINT "SaleChannelMagicLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SaleChannelMagicLink_tokenHash_key" ON "SaleChannelMagicLink"("tokenHash");
CREATE INDEX "SaleChannelMagicLink_storeId_saleChannelId_expiresAt_idx" ON "SaleChannelMagicLink"("storeId", "saleChannelId", "expiresAt");
CREATE INDEX "SaleChannelMagicLink_storeId_revokedAt_idx" ON "SaleChannelMagicLink"("storeId", "revokedAt");

ALTER TABLE "SaleChannelMagicLink" ADD CONSTRAINT "SaleChannelMagicLink_saleChannelId_fkey" FOREIGN KEY ("saleChannelId") REFERENCES "SaleChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleChannelMagicLink" ADD CONSTRAINT "SaleChannelMagicLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleChannelMagicLink" ADD CONSTRAINT "SaleChannelMagicLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Purchase order destination snapshots for orders whose destination is not a saved SaleChannelLocation.
ALTER TABLE "PurchaseOrder"
ADD COLUMN "shipToLocationName" TEXT,
ADD COLUMN "shipToRecipientName" TEXT,
ADD COLUMN "shipToCompanyName" TEXT,
ADD COLUMN "shipToPhoneNumber" TEXT,
ADD COLUMN "shipToEmail" TEXT,
ADD COLUMN "shipToAddressLine1" TEXT,
ADD COLUMN "shipToAddressLine2" TEXT,
ADD COLUMN "shipToCity" TEXT,
ADD COLUMN "shipToStateProvince" TEXT,
ADD COLUMN "shipToPostalCode" TEXT,
ADD COLUMN "shipToCountry" TEXT,
ADD COLUMN "shipToNotes" TEXT;

UPDATE "PurchaseOrder" po
SET
  "shipToLocationName" = COALESCE(po."shipToLocationName", loc."name"),
  "shipToRecipientName" = COALESCE(po."shipToRecipientName", loc."recipientName"),
  "shipToCompanyName" = COALESCE(po."shipToCompanyName", loc."companyName"),
  "shipToPhoneNumber" = COALESCE(po."shipToPhoneNumber", loc."phoneNumber"),
  "shipToEmail" = COALESCE(po."shipToEmail", loc."email"),
  "shipToAddressLine1" = COALESCE(po."shipToAddressLine1", loc."addressLine1"),
  "shipToAddressLine2" = COALESCE(po."shipToAddressLine2", loc."addressLine2"),
  "shipToCity" = COALESCE(po."shipToCity", loc."city"),
  "shipToStateProvince" = COALESCE(po."shipToStateProvince", loc."stateProvince"),
  "shipToPostalCode" = COALESCE(po."shipToPostalCode", loc."postalCode"),
  "shipToCountry" = COALESCE(po."shipToCountry", loc."country"),
  "shipToNotes" = COALESCE(po."shipToNotes", loc."shippingNotes")
FROM "SaleChannelLocation" loc
WHERE po."saleChannelLocationId" = loc."id";

-- Draft destinations can now be either saved locations or session-scoped snapshots.
ALTER TABLE "DraftPurchaseOrder"
ADD COLUMN "destinationKey" TEXT,
ADD COLUMN "shipToLocationName" TEXT,
ADD COLUMN "shipToRecipientName" TEXT,
ADD COLUMN "shipToCompanyName" TEXT,
ADD COLUMN "shipToPhoneNumber" TEXT,
ADD COLUMN "shipToEmail" TEXT,
ADD COLUMN "shipToAddressLine1" TEXT,
ADD COLUMN "shipToAddressLine2" TEXT,
ADD COLUMN "shipToCity" TEXT,
ADD COLUMN "shipToStateProvince" TEXT,
ADD COLUMN "shipToPostalCode" TEXT,
ADD COLUMN "shipToCountry" TEXT,
ADD COLUMN "shipToNotes" TEXT;

UPDATE "DraftPurchaseOrder" draft
SET
  "destinationKey" = 'location:' || draft."saleChannelLocationId"::text,
  "shipToLocationName" = COALESCE(draft."shipToLocationName", loc."name"),
  "shipToRecipientName" = COALESCE(draft."shipToRecipientName", loc."recipientName"),
  "shipToCompanyName" = COALESCE(draft."shipToCompanyName", loc."companyName"),
  "shipToPhoneNumber" = COALESCE(draft."shipToPhoneNumber", loc."phoneNumber"),
  "shipToEmail" = COALESCE(draft."shipToEmail", loc."email"),
  "shipToAddressLine1" = COALESCE(draft."shipToAddressLine1", loc."addressLine1"),
  "shipToAddressLine2" = COALESCE(draft."shipToAddressLine2", loc."addressLine2"),
  "shipToCity" = COALESCE(draft."shipToCity", loc."city"),
  "shipToStateProvince" = COALESCE(draft."shipToStateProvince", loc."stateProvince"),
  "shipToPostalCode" = COALESCE(draft."shipToPostalCode", loc."postalCode"),
  "shipToCountry" = COALESCE(draft."shipToCountry", loc."country"),
  "shipToNotes" = COALESCE(draft."shipToNotes", loc."shippingNotes")
FROM "SaleChannelLocation" loc
WHERE draft."saleChannelLocationId" = loc."id";

UPDATE "DraftPurchaseOrder"
SET "destinationKey" = 'draft:' || "id"::text
WHERE "destinationKey" IS NULL;

ALTER TABLE "DraftPurchaseOrder" ALTER COLUMN "destinationKey" SET NOT NULL;

DROP INDEX IF EXISTS "DraftPurchaseOrder_invoiceId_saleChannelLocationId_key";
ALTER TABLE "DraftPurchaseOrder" ALTER COLUMN "saleChannelLocationId" DROP NOT NULL;
CREATE UNIQUE INDEX "DraftPurchaseOrder_invoiceId_destinationKey_key" ON "DraftPurchaseOrder"("invoiceId", "destinationKey");
