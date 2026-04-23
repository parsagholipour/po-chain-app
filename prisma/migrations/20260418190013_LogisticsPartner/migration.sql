-- CreateTable
CREATE TABLE "LogisticsPartner" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "logoKey" TEXT,
    "contactNumber" TEXT,
    "link" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "type" "LogisticsPartnerType" NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "LogisticsPartner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogisticsPartner_storeId_type_name_idx" ON "LogisticsPartner"("storeId", "type", "name");

-- CreateIndex
CREATE INDEX "LogisticsPartner_storeId_createdAt_idx" ON "LogisticsPartner"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "LogisticsPartner" ADD CONSTRAINT "LogisticsPartner_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsPartner" ADD CONSTRAINT "LogisticsPartner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
