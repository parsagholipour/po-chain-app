-- AlterTable
ALTER TABLE "ManufacturingOrder" ADD COLUMN "date" DATE;

-- Existing manufacturing orders take their created date.
UPDATE "ManufacturingOrder" SET "date" = "createdAt"::date;

ALTER TABLE "ManufacturingOrder" ALTER COLUMN "date" SET NOT NULL;
