-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "date" DATE;

-- Existing purchase orders take their created date.
UPDATE "PurchaseOrder" SET "date" = "createdAt"::date;

ALTER TABLE "PurchaseOrder" ALTER COLUMN "date" SET NOT NULL;
