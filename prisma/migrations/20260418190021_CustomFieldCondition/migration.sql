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
