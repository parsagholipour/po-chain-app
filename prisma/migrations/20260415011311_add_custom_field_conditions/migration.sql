-- CreateEnum
CREATE TYPE "ConditionLogic" AS ENUM ('and', 'or');

-- CreateEnum
CREATE TYPE "ConditionOperator" AS ENUM ('equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'contains', 'not_empty', 'is_empty');

-- AlterTable
ALTER TABLE "CustomFieldDefinition" ADD COLUMN     "conditionLogic" "ConditionLogic" NOT NULL DEFAULT 'and';

-- CreateTable
CREATE TABLE "CustomFieldCondition" (
    "id" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "sourceField" TEXT NOT NULL,
    "operator" "ConditionOperator" NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomFieldCondition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomFieldCondition_definitionId_idx" ON "CustomFieldCondition"("definitionId");

-- AddForeignKey
ALTER TABLE "CustomFieldCondition" ADD CONSTRAINT "CustomFieldCondition_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
