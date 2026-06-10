-- AlterTable
ALTER TABLE "SaleChannelLocation" ADD COLUMN "identifier" TEXT;

-- Backfill existing rows from location name
UPDATE "SaleChannelLocation" SET "identifier" = "name" WHERE "identifier" IS NULL;

-- AlterTable
ALTER TABLE "SaleChannelLocation" ALTER COLUMN "identifier" SET NOT NULL;
