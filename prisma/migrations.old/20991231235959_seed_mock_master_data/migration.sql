-- Mock master data for local/dev. Requires a User row for createdById FKs.
-- Multi-tenancy migration seeds default store with this stable UUID.

INSERT INTO "User" ("id", "keycloakSub", "email", "name", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'seed.mock@po-app.local',
  'Seed (mock data)',
  CURRENT_TIMESTAMP
);

INSERT INTO "UserStore" ("userId", "storeId", "createdAt")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13',
  CURRENT_TIMESTAMP
);

INSERT INTO "Manufacturer" ("id", "name", "logoKey", "region", "updatedAt", "createdById", "storeId")
VALUES
  (
    'a0000001-0000-4000-8000-000000000001',
    'Acme Manufacturing',
    NULL,
    'United States',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13'
  ),
  (
    'a0000001-0000-4000-8000-000000000002',
    'Shenzhen Prime Industrial',
    NULL,
    'China',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13'
  ),
  (
    'a0000001-0000-4000-8000-000000000003',
    'EU Textiles GmbH',
    NULL,
    'Germany',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13'
  );

INSERT INTO "SaleChannel" ("id", "name", "logoKey", "type", "updatedAt", "createdById", "storeId")
VALUES
  (
    'b0000001-0000-4000-8000-000000000001',
    'PHD',
    NULL,
    'distributor',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13'
  ),
  (
    'b0000001-0000-4000-8000-000000000002',
    'Amazon US Storefront',
    NULL,
    'amazon',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13'
  ),
  (
    'b0000001-0000-4000-8000-000000000003',
    'CJ Dropshipping',
    NULL,
    'cjdropshipping',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13'
  );

INSERT INTO "Product" (
  "id",
  "name",
  "sku",
  "upcGtin",
  "cost",
  "price",
  "mop",
  "map",
  "msrp",
  "quantityPerCarton",
  "orderByDate",
  "editingStatus",
  "description",
  "imageLink",
  "stockCount",
  "imageKey",
  "barcodeKey",
  "packagingKey",
  "storeId",
  "defaultManufacturerId",
  "verified",
  "updatedAt",
  "createdById"
)
VALUES
  (
    'c0000001-0000-4000-8000-000000000001',
    'Standard Widget A',
    'MOCK-SKU-WDG-A',
    '0001234560001',
    NULL,
    NULL,
    250,
    19.99,
    24.99,
    24,
    TIMESTAMP '2026-06-15 00:00:00',
    'standard',
    'Reliable standard widget for everyday inventory builds.',
    'https://example.com/products/mock-widget-a.png',
    480,
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13',
    'a0000001-0000-4000-8000-000000000001',
    true,
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    'c0000001-0000-4000-8000-000000000002',
    'Standard Widget B',
    'MOCK-SKU-WDG-B',
    '0001234560002',
    NULL,
    NULL,
    300,
    21.99,
    29.99,
    20,
    TIMESTAMP '2026-06-22 00:00:00',
    'final_stock',
    'Alternate widget variant with final-stock handling.',
    'https://example.com/products/mock-widget-b.png',
    175,
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13',
    'a0000001-0000-4000-8000-000000000001',
    true,
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    'c0000001-0000-4000-8000-000000000003',
    'Gadget Pro',
    'MOCK-SKU-GDG-PRO',
    '0001234560003',
    NULL,
    NULL,
    150,
    44.99,
    59.99,
    12,
    TIMESTAMP '2026-07-01 00:00:00',
    'one_print_only',
    'Premium gadget with a one-print-only production note.',
    'https://example.com/products/mock-gadget-pro.png',
    64,
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13',
    'a0000001-0000-4000-8000-000000000002',
    true,
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    'c0000001-0000-4000-8000-000000000004',
    'Premium Linen Set',
    'MOCK-SKU-LINEN-01',
    '0001234560004',
    NULL,
    NULL,
    80,
    79.99,
    99.99,
    6,
    TIMESTAMP '2026-07-10 00:00:00',
    'standard',
    'Soft linen set packaged for premium retail channels.',
    'https://example.com/products/mock-premium-linen-set.png',
    38,
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13',
    'a0000001-0000-4000-8000-000000000003',
    true,
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    'c0000001-0000-4000-8000-000000000005',
    'USB-C Cable 2m',
    'MOCK-SKU-CBL-USBC',
    '0001234560005',
    NULL,
    NULL,
    1000,
    8.99,
    12.99,
    100,
    TIMESTAMP '2026-05-30 00:00:00',
    'standard',
    'Durable two-meter USB-C cable for replenishment orders.',
    'https://example.com/products/mock-usb-c-cable-2m.png',
    1200,
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13',
    'a0000001-0000-4000-8000-000000000002',
    true,
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  );
