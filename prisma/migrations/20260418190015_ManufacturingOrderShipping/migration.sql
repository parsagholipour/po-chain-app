-- CreateTable
CREATE TABLE "ManufacturingOrderShipping" (
    "manufacturingOrderId" UUID NOT NULL,
    "shippingId" UUID NOT NULL,
    "storeId" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrderShipping_pkey" PRIMARY KEY ("manufacturingOrderId","shippingId")
);

-- CreateIndex
CREATE INDEX "ManufacturingOrderShipping_storeId_shippingId_idx" ON "ManufacturingOrderShipping"("storeId", "shippingId");

-- AddForeignKey
ALTER TABLE "ManufacturingOrderShipping" ADD CONSTRAINT "ManufacturingOrderShipping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderShipping" ADD CONSTRAINT "ManufacturingOrderShipping_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderShipping" ADD CONSTRAINT "ManufacturingOrderShipping_shippingId_fkey" FOREIGN KEY ("shippingId") REFERENCES "Shipping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
