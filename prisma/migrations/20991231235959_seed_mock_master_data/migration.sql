-- Mock master data for local/dev. Requires a User row for createdById FKs.

INSERT INTO "User" ("id", "keycloakSub", "email", "name", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'seed.mock@po-app.local',
  'Seed (mock data)',
  CURRENT_TIMESTAMP
);

INSERT INTO "Manufacturer" ("id", "name", "logoKey", "region", "updatedAt", "createdById")
VALUES
  (
    'a0000001-0000-4000-8000-000000000001',
    'Acme Manufacturing',
    NULL,
    'United States',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    'a0000001-0000-4000-8000-000000000002',
    'Shenzhen Prime Industrial',
    NULL,
    'China',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    'a0000001-0000-4000-8000-000000000003',
    'EU Textiles GmbH',
    NULL,
    'Germany',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  );

INSERT INTO "SaleChannel" ("id", "name", "logoKey", "type", "updatedAt", "createdById")
VALUES
  (
    'b0000001-0000-4000-8000-000000000001',
    'PHD',
    NULL,
    'distributor',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    'b0000001-0000-4000-8000-000000000002',
    'Amazon US Storefront',
    NULL,
    'amazon',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    'b0000001-0000-4000-8000-000000000003',
    'CJ Dropshipping',
    NULL,
    'cjdropshipping',
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  );

INSERT INTO "Product" (
  "id",
  "name",
  "sku",
  "imageKey",
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
    'a0000001-0000-4000-8000-000000000002',
    false,
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  ),
  (
    'c0000001-0000-4000-8000-000000000004',
    'Premium Linen Set',
    'MOCK-SKU-LINEN-01',
    NULL,
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
    'a0000001-0000-4000-8000-000000000002',
    false,
    CURRENT_TIMESTAMP,
    '00000000-0000-4000-8000-000000000001'
  );
