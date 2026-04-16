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
  "cost",
  "price",
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
    NULL,
    NULL,
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
    NULL,
    NULL,
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
    NULL,
    NULL,
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
    NULL,
    NULL,
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
    NULL,
    NULL,
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    'products/3fd226b8-f335-43fb-9de5-f123266b11fe-images-1-.png?width=206&height=245',
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13',
    'a0000001-0000-4000-8000-000000000002',
    true,
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  );
