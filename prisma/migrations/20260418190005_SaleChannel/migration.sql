-- CreateTable
CREATE TABLE "SaleChannel" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "logoKey" TEXT,
    "type" "SaleChannelType" NOT NULL,
    "contactNumber" TEXT,
    "link" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "SaleChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleChannel_storeId_type_name_idx" ON "SaleChannel"("storeId", "type", "name");

-- CreateIndex
CREATE INDEX "SaleChannel_storeId_createdAt_idx" ON "SaleChannel"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "SaleChannel" ADD CONSTRAINT "SaleChannel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleChannel" ADD CONSTRAINT "SaleChannel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
