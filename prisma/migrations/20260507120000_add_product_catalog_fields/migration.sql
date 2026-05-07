-- CreateEnum
CREATE TYPE "ProductEditingStatus" AS ENUM ('standard', 'final_stock', 'one_print_only');

-- AlterTable
ALTER TABLE "Product"
    ADD COLUMN "upcGtin" TEXT,
    ADD COLUMN "mop" INTEGER,
    ADD COLUMN "map" DECIMAL(12,2),
    ADD COLUMN "msrp" DECIMAL(12,2),
    ADD COLUMN "quantityPerCarton" INTEGER,
    ADD COLUMN "orderByDate" TIMESTAMP(3),
    ADD COLUMN "editingStatus" "ProductEditingStatus" NOT NULL DEFAULT 'standard',
    ADD COLUMN "description" TEXT,
    ADD COLUMN "imageLink" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "stockCount" INTEGER;

-- Backfill existing local/dev mock products seeded before these catalog fields existed.
UPDATE "Product" AS p
SET
    "upcGtin" = v."upcGtin",
    "mop" = v."mop",
    "map" = v."map",
    "msrp" = v."msrp",
    "quantityPerCarton" = v."quantityPerCarton",
    "orderByDate" = v."orderByDate",
    "editingStatus" = v."editingStatus"::"ProductEditingStatus",
    "description" = v."description",
    "imageLink" = v."imageLink",
    "stockCount" = v."stockCount",
    "updatedAt" = CURRENT_TIMESTAMP
FROM (
    VALUES
        (
            'c0000001-0000-4000-8000-000000000001'::uuid,
            '0001234560001',
            250,
            19.99::DECIMAL(12,2),
            24.99::DECIMAL(12,2),
            24,
            TIMESTAMP '2026-06-15 00:00:00',
            'standard',
            'Reliable standard widget for everyday inventory builds.',
            'https://example.com/products/mock-widget-a.png',
            480
        ),
        (
            'c0000001-0000-4000-8000-000000000002'::uuid,
            '0001234560002',
            300,
            21.99::DECIMAL(12,2),
            29.99::DECIMAL(12,2),
            20,
            TIMESTAMP '2026-06-22 00:00:00',
            'final_stock',
            'Alternate widget variant with final-stock handling.',
            'https://example.com/products/mock-widget-b.png',
            175
        ),
        (
            'c0000001-0000-4000-8000-000000000003'::uuid,
            '0001234560003',
            150,
            44.99::DECIMAL(12,2),
            59.99::DECIMAL(12,2),
            12,
            TIMESTAMP '2026-07-01 00:00:00',
            'one_print_only',
            'Premium gadget with a one-print-only production note.',
            'https://example.com/products/mock-gadget-pro.png',
            64
        ),
        (
            'c0000001-0000-4000-8000-000000000004'::uuid,
            '0001234560004',
            80,
            79.99::DECIMAL(12,2),
            99.99::DECIMAL(12,2),
            6,
            TIMESTAMP '2026-07-10 00:00:00',
            'standard',
            'Soft linen set packaged for premium retail channels.',
            'https://example.com/products/mock-premium-linen-set.png',
            38
        ),
        (
            'c0000001-0000-4000-8000-000000000005'::uuid,
            '0001234560005',
            1000,
            8.99::DECIMAL(12,2),
            12.99::DECIMAL(12,2),
            100,
            TIMESTAMP '2026-05-30 00:00:00',
            'standard',
            'Durable two-meter USB-C cable for replenishment orders.',
            'https://example.com/products/mock-usb-c-cable-2m.png',
            1200
        )
) AS v(
    "id",
    "upcGtin",
    "mop",
    "map",
    "msrp",
    "quantityPerCarton",
    "orderByDate",
    "editingStatus",
    "description",
    "imageLink",
    "stockCount"
)
WHERE p."id" = v."id";

-- CreateIndex
CREATE INDEX "Product_storeId_upcGtin_idx" ON "Product"("storeId", "upcGtin");

-- CreateIndex
CREATE INDEX "Product_storeId_editingStatus_idx" ON "Product"("storeId", "editingStatus");

-- CreateIndex
CREATE INDEX "Product_storeId_orderByDate_idx" ON "Product"("storeId", "orderByDate");
