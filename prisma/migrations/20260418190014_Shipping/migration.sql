-- CreateTable
CREATE TABLE "Shipping" (
    "id" UUID NOT NULL,
    "type" "ShippingType" NOT NULL,
    "status" "ShippingStatus" NOT NULL DEFAULT 'pending',
    "cost" DECIMAL(12,2),
    "deliveryDutiesPaid" BOOLEAN NOT NULL DEFAULT false,
    "trackingNumber" TEXT NOT NULL,
    "shippedAt" TIMESTAMP(3),
    "trackingLink" TEXT,
    "notes" TEXT,
    "invoiceDocumentKey" TEXT,
    "logisticsPartnerId" UUID,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "Shipping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shipping_storeId_type_status_idx" ON "Shipping"("storeId", "type", "status");

-- CreateIndex
CREATE INDEX "Shipping_storeId_logisticsPartnerId_idx" ON "Shipping"("storeId", "logisticsPartnerId");

-- CreateIndex
CREATE INDEX "Shipping_storeId_createdAt_idx" ON "Shipping"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Shipping_storeId_shippedAt_idx" ON "Shipping"("storeId", "shippedAt");

-- AddForeignKey
ALTER TABLE "Shipping" ADD CONSTRAINT "Shipping_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipping" ADD CONSTRAINT "Shipping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipping" ADD CONSTRAINT "Shipping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
