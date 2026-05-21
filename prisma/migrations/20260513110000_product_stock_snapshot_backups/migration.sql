-- CreateTable
CREATE TABLE "ProductStockSnapshotBackup" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "productCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductStockSnapshotBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductStockSnapshotBackup_storeId_snapshotDate_key" ON "ProductStockSnapshotBackup"("storeId", "snapshotDate");

-- CreateIndex
CREATE INDEX "ProductStockSnapshotBackup_storeId_createdAt_idx" ON "ProductStockSnapshotBackup"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductStockSnapshotBackup" ADD CONSTRAINT "ProductStockSnapshotBackup_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
