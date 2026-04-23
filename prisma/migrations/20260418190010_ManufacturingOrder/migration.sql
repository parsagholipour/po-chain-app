-- CreateTable
CREATE TABLE "ManufacturingOrder" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ManufacturingOrderStatus" NOT NULL DEFAULT 'open',
    "documentKey" TEXT,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "ManufacturingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrder_number_key" ON "ManufacturingOrder"("number");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_storeId_status_idx" ON "ManufacturingOrder"("storeId", "status");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_storeId_number_idx" ON "ManufacturingOrder"("storeId", "number");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_storeId_createdAt_idx" ON "ManufacturingOrder"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
