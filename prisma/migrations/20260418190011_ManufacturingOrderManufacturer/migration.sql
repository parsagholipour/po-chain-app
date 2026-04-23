-- CreateTable
CREATE TABLE "ManufacturingOrderManufacturer" (
    "manufacturingOrderId" UUID NOT NULL,
    "manufacturerId" UUID NOT NULL,
    "status" "ManufacturingOrderManufacturerStatus" NOT NULL DEFAULT 'initial',
    "invoiceId" UUID,
    "storeId" UUID NOT NULL,
    "depositPaidAt" TIMESTAMP(3),
    "depositPaidAmount" DECIMAL(12,2),
    "depositRefNumber" TEXT,
    "depositDocumentKey" TEXT,
    "manufacturingStartedAt" TIMESTAMP(3),
    "estimatedCompletionAt" TIMESTAMP(3),
    "balancePaidAt" TIMESTAMP(3),
    "balancePaidAmount" DECIMAL(12,2),
    "balanceRefNumber" TEXT,
    "balanceDocumentKey" TEXT,
    "readyAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrderManufacturer_pkey" PRIMARY KEY ("manufacturingOrderId","manufacturerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrderManufacturer_invoiceId_key" ON "ManufacturingOrderManufacturer"("invoiceId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderManufacturer_storeId_manufacturerId_idx" ON "ManufacturingOrderManufacturer"("storeId", "manufacturerId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderManufacturer_storeId_invoiceId_idx" ON "ManufacturingOrderManufacturer"("storeId", "invoiceId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderManufacturer_storeId_depositPaidAt_idx" ON "ManufacturingOrderManufacturer"("storeId", "depositPaidAt");

-- CreateIndex
CREATE INDEX "ManufacturingOrderManufacturer_storeId_balancePaidAt_idx" ON "ManufacturingOrderManufacturer"("storeId", "balancePaidAt");

-- CreateIndex
CREATE INDEX "ManufacturingOrderManufacturer_storeId_manufacturingStarted_idx" ON "ManufacturingOrderManufacturer"("storeId", "manufacturingStartedAt");

-- CreateIndex
CREATE INDEX "MOM_storeId_outstanding_balance_idx" ON "ManufacturingOrderManufacturer"("storeId") WHERE ("depositPaidAt" IS NOT NULL AND "balancePaidAt" IS NULL);

-- AddForeignKey
ALTER TABLE "ManufacturingOrderManufacturer" ADD CONSTRAINT "ManufacturingOrderManufacturer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderManufacturer" ADD CONSTRAINT "ManufacturingOrderManufacturer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderManufacturer" ADD CONSTRAINT "ManufacturingOrderManufacturer_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderManufacturer" ADD CONSTRAINT "ManufacturingOrderManufacturer_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderManufacturer" ADD CONSTRAINT "ManufacturingOrderManufacturer_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
