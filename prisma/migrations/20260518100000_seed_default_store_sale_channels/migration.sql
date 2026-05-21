-- Backfill one default store sale channel for each store so magic-link orders
-- have a stable saleChannelId without requiring manual setup.
WITH store_creators AS (
  SELECT
    s."id" AS "storeId",
    COALESCE(
      (
        SELECT u."id"
        FROM "UserStore" us
        JOIN "User" u ON u."id" = us."userId"
        WHERE us."storeId" = s."id" AND u."type" = 'internal'
        ORDER BY us."createdAt" ASC, u."createdAt" ASC
        LIMIT 1
      ),
      (
        SELECT u."id"
        FROM "User" u
        WHERE u."type" = 'internal'
        ORDER BY u."createdAt" ASC
        LIMIT 1
      ),
      (
        SELECT u."id"
        FROM "User" u
        ORDER BY u."createdAt" ASC
        LIMIT 1
      )
    ) AS "createdById"
  FROM "Store" s
),
stores_missing_channel AS (
  SELECT sc.*
  FROM store_creators sc
  WHERE
    sc."createdById" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "SaleChannel" existing
      WHERE existing."storeId" = sc."storeId" AND existing."type" = 'store'
    )
)
INSERT INTO "SaleChannel" (
  "id",
  "name",
  "logoKey",
  "type",
  "contactNumber",
  "link",
  "email",
  "address",
  "notes",
  "storeId",
  "createdAt",
  "updatedAt",
  "createdById"
)
SELECT
  gen_random_uuid(),
  'Store by magic link',
  NULL,
  'store',
  NULL,
  NULL,
  NULL,
  NULL,
  'Default storefront sale channel for magic-link orders.',
  sc."storeId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  sc."createdById"
FROM stores_missing_channel sc;
