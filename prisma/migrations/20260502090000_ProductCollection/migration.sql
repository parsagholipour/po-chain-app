-- CreateTable
CREATE TABLE "ProductCollection" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "ProductCollection_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "collectionId" UUID;

-- CreateIndex
CREATE INDEX "ProductCollection_storeId_name_idx" ON "ProductCollection"("storeId", "name");

-- CreateIndex
CREATE INDEX "ProductCollection_storeId_createdAt_idx" ON "ProductCollection"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_storeId_collectionId_idx" ON "Product"("storeId", "collectionId");

-- AddForeignKey
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ProductCollection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
