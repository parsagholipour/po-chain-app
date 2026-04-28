-- CreateTable
CREATE TABLE "ProductType" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "typeId" UUID;

-- CreateIndex
CREATE INDEX "ProductType_storeId_name_idx" ON "ProductType"("storeId", "name");

-- CreateIndex
CREATE INDEX "ProductType_storeId_createdAt_idx" ON "ProductType"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_storeId_typeId_idx" ON "Product"("storeId", "typeId");

-- AddForeignKey
ALTER TABLE "ProductType" ADD CONSTRAINT "ProductType_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductType" ADD CONSTRAINT "ProductType_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProductType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
