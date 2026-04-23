/*
  Warnings:

  - You are about to drop the column `balancePaidAt` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `depositPaidAt` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedCompletionDate` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `orderDate` on the `Invoice` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('text', 'number', 'date', 'boolean', 'file', 'image');

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "balancePaidAt",
DROP COLUMN "depositPaidAt",
DROP COLUMN "estimatedCompletionDate",
DROP COLUMN "orderDate";

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "textValue" TEXT,
    "numberValue" DECIMAL(12,2),
    "dateValue" TIMESTAMP(3),
    "booleanValue" BOOLEAN,
    "fileKey" TEXT,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_storeId_entityType_sortOrder_idx" ON "CustomFieldDefinition"("storeId", "entityType", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_storeId_entityType_fieldKey_key" ON "CustomFieldDefinition"("storeId", "entityType", "fieldKey");

-- CreateIndex
CREATE INDEX "CustomFieldValue_storeId_entityId_idx" ON "CustomFieldValue"("storeId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_definitionId_entityId_key" ON "CustomFieldValue"("definitionId", "entityId");

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
