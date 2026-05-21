-- Idempotent dev manufacturer seed.
-- Resolves cases where 20260418190023_seed_dev_master_data rolled back because
-- Manufacturer.storeId pointed at a hardcoded UUID while Store already existed
-- under arcane-fortress with a different id (ON CONFLICT slug keeps the old row).

INSERT INTO "User" ("id", "keycloakSub", "email", "name", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'seed.mock@po-app.local',
  'Seed (Shopify catalog)',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE
SET
  "email" = EXCLUDED."email",
  "name" = EXCLUDED."name",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "UserStore" ("userId", "storeId", "createdAt")
SELECT
  '00000000-0000-4000-8000-000000000001',
  s."id",
  CURRENT_TIMESTAMP
FROM "Store" s
WHERE s."slug" = 'arcane-fortress'
ON CONFLICT ("userId", "storeId") DO NOTHING;

INSERT INTO "Manufacturer" ("id", "name", "logoKey", "region", "updatedAt", "createdById", "storeId")
SELECT
  'a0000001-0000-4000-8000-000000000001',
  'Arcane Fortress',
  NULL,
  'United States',
  CURRENT_TIMESTAMP,
  '00000000-0000-4000-8000-000000000001',
  s."id"
FROM "Store" s
WHERE s."slug" = 'arcane-fortress'
ON CONFLICT ("id") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "region" = EXCLUDED."region",
  "storeId" = EXCLUDED."storeId",
  "updatedAt" = CURRENT_TIMESTAMP;
