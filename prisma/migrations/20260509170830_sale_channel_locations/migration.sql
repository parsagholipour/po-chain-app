-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "saleChannelLocationId" UUID;

-- AlterTable
ALTER TABLE "Shipping" ADD COLUMN     "saleChannelLocationId" UUID,
ADD COLUMN     "shipToAddressLine1" TEXT,
ADD COLUMN     "shipToAddressLine2" TEXT,
ADD COLUMN     "shipToCity" TEXT,
ADD COLUMN     "shipToCompanyName" TEXT,
ADD COLUMN     "shipToCountry" TEXT,
ADD COLUMN     "shipToEmail" TEXT,
ADD COLUMN     "shipToLocationName" TEXT,
ADD COLUMN     "shipToNotes" TEXT,
ADD COLUMN     "shipToPhoneNumber" TEXT,
ADD COLUMN     "shipToPostalCode" TEXT,
ADD COLUMN     "shipToRecipientName" TEXT,
ADD COLUMN     "shipToStateProvince" TEXT;

-- CreateTable
CREATE TABLE "SaleChannelLocation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "companyName" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "stateProvince" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL,
    "shippingNotes" TEXT,
    "saleChannelId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "SaleChannelLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleChannelLocation_storeId_saleChannelId_name_idx" ON "SaleChannelLocation"("storeId", "saleChannelId", "name");

-- CreateIndex
CREATE INDEX "SaleChannelLocation_storeId_createdAt_idx" ON "SaleChannelLocation"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_storeId_saleChannelLocationId_idx" ON "PurchaseOrder"("storeId", "saleChannelLocationId");

-- CreateIndex
CREATE INDEX "Shipping_storeId_saleChannelLocationId_idx" ON "Shipping"("storeId", "saleChannelLocationId");

-- AddForeignKey
ALTER TABLE "SaleChannelLocation" ADD CONSTRAINT "SaleChannelLocation_saleChannelId_fkey" FOREIGN KEY ("saleChannelId") REFERENCES "SaleChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleChannelLocation" ADD CONSTRAINT "SaleChannelLocation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleChannelLocation" ADD CONSTRAINT "SaleChannelLocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_saleChannelLocationId_fkey" FOREIGN KEY ("saleChannelLocationId") REFERENCES "SaleChannelLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipping" ADD CONSTRAINT "Shipping_saleChannelLocationId_fkey" FOREIGN KEY ("saleChannelLocationId") REFERENCES "SaleChannelLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
