-- Seed initial Shopify and Stripe integration settings from session-local values.
--
-- This migration intentionally does not hard-code secret values. Provide the
-- values as PostgreSQL settings when applying it, for example through PGOPTIONS:
--
--   -c app.initial_mock.shopify_webhook_signing_secret=...
--   -c app.initial_mock.shopify_admin_token=...
--   -c app.initial_mock.shopify_shop_domain=...
--   -c app.initial_mock.stripe_secret_key=...
--   -c app.initial_mock.stripe_webhook_signing_secret=...
--   -c app.shopify_integration_encryption_key=...
--   -c app.payment_provider_encryption_key=...
--
-- If any setting is absent, the migration safely skips the seed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  shopify_webhook_signing_secret text := NULLIF(current_setting('app.initial_mock.shopify_webhook_signing_secret', true), '');
  shopify_admin_token text := NULLIF(current_setting('app.initial_mock.shopify_admin_token', true), '');
  shopify_shop_domain text := NULLIF(current_setting('app.initial_mock.shopify_shop_domain', true), '');
  stripe_secret_key text := NULLIF(current_setting('app.initial_mock.stripe_secret_key', true), '');
  stripe_webhook_signing_secret text := NULLIF(current_setting('app.initial_mock.stripe_webhook_signing_secret', true), '');
  shopify_encryption_key text := NULLIF(current_setting('app.shopify_integration_encryption_key', true), '');
  payment_provider_encryption_key text := NULLIF(current_setting('app.payment_provider_encryption_key', true), '');
  seeded_store_count integer := 0;
  skipped_store_count integer := 0;
BEGIN
  IF shopify_webhook_signing_secret IS NULL
    OR shopify_admin_token IS NULL
    OR shopify_shop_domain IS NULL
    OR stripe_secret_key IS NULL
    OR stripe_webhook_signing_secret IS NULL
    OR shopify_encryption_key IS NULL
    OR payment_provider_encryption_key IS NULL
  THEN
    RAISE NOTICE 'Skipping initial integration settings seed because one or more required app.* session settings are missing.';
    RETURN;
  END IF;

  INSERT INTO "ShopifyIntegration" (
    "id",
    "storeId",
    "shopDomain",
    "enabled",
    "accessTokenEncrypted",
    "webhookSecretEncrypted",
    "createdAt",
    "updatedAt"
  )
  SELECT
    gen_random_uuid(),
    s."id",
    shopify_shop_domain,
    true,
    'pgp:' || encode(
      pgp_sym_encrypt(shopify_admin_token, shopify_encryption_key, 'cipher-algo=aes256'),
      'base64'
    ),
    'pgp:' || encode(
      pgp_sym_encrypt(shopify_webhook_signing_secret, shopify_encryption_key, 'cipher-algo=aes256'),
      'base64'
    ),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "Store" s
  ON CONFLICT ("storeId") DO UPDATE
  SET
    "shopDomain" = CASE
      WHEN "ShopifyIntegration"."shopDomain" = '' THEN EXCLUDED."shopDomain"
      ELSE "ShopifyIntegration"."shopDomain"
    END,
    "enabled" = CASE
      WHEN "ShopifyIntegration"."accessTokenEncrypted" IS NULL
        OR "ShopifyIntegration"."webhookSecretEncrypted" IS NULL
      THEN true
      ELSE "ShopifyIntegration"."enabled"
    END,
    "accessTokenEncrypted" = COALESCE(
      "ShopifyIntegration"."accessTokenEncrypted",
      EXCLUDED."accessTokenEncrypted"
    ),
    "webhookSecretEncrypted" = COALESCE(
      "ShopifyIntegration"."webhookSecretEncrypted",
      EXCLUDED."webhookSecretEncrypted"
    ),
    "updatedAt" = CURRENT_TIMESTAMP;

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
  stripe_seed AS (
    INSERT INTO "StorePaymentProviderSetting" (
      "id",
      "storeId",
      "provider",
      "enabled",
      "currency",
      "secretKeyEncrypted",
      "webhookSecretEncrypted",
      "secretKeyLast4",
      "webhookSecretLast4",
      "createdAt",
      "updatedAt",
      "createdById",
      "updatedById"
    )
    SELECT
      gen_random_uuid(),
      sc."storeId",
      'stripe',
      true,
      'usd',
      'pgp:' || encode(
        pgp_sym_encrypt(
          stripe_secret_key,
          payment_provider_encryption_key || ':' || sc."storeId"::text,
          'cipher-algo=aes256'
        ),
        'base64'
      ),
      'pgp:' || encode(
        pgp_sym_encrypt(
          stripe_webhook_signing_secret,
          payment_provider_encryption_key || ':' || sc."storeId"::text,
          'cipher-algo=aes256'
        ),
        'base64'
      ),
      RIGHT(stripe_secret_key, 4),
      RIGHT(stripe_webhook_signing_secret, 4),
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      sc."createdById",
      sc."createdById"
    FROM store_creators sc
    WHERE sc."createdById" IS NOT NULL
    ON CONFLICT ("storeId", "provider") DO UPDATE
    SET
      "enabled" = CASE
        WHEN "StorePaymentProviderSetting"."secretKeyEncrypted" IS NULL
          OR "StorePaymentProviderSetting"."webhookSecretEncrypted" IS NULL
        THEN true
        ELSE "StorePaymentProviderSetting"."enabled"
      END,
      "currency" = COALESCE(NULLIF("StorePaymentProviderSetting"."currency", ''), EXCLUDED."currency"),
      "secretKeyEncrypted" = COALESCE(
        "StorePaymentProviderSetting"."secretKeyEncrypted",
        EXCLUDED."secretKeyEncrypted"
      ),
      "webhookSecretEncrypted" = COALESCE(
        "StorePaymentProviderSetting"."webhookSecretEncrypted",
        EXCLUDED."webhookSecretEncrypted"
      ),
      "secretKeyLast4" = COALESCE(
        "StorePaymentProviderSetting"."secretKeyLast4",
        EXCLUDED."secretKeyLast4"
      ),
      "webhookSecretLast4" = COALESCE(
        "StorePaymentProviderSetting"."webhookSecretLast4",
        EXCLUDED."webhookSecretLast4"
      ),
      "updatedById" = COALESCE("StorePaymentProviderSetting"."updatedById", EXCLUDED."updatedById"),
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "storeId"
  )
  SELECT COUNT(*) INTO seeded_store_count FROM stripe_seed;

  SELECT COUNT(*) INTO skipped_store_count
  FROM "Store" s
  WHERE NOT EXISTS (
    SELECT 1
    FROM "StorePaymentProviderSetting" p
    WHERE p."storeId" = s."id" AND p."provider" = 'stripe'
  );

  IF skipped_store_count > 0 THEN
    RAISE NOTICE 'Skipped Stripe seed for % store(s) because no user exists for createdById.', skipped_store_count;
  END IF;

  RAISE NOTICE 'Seeded initial integration settings for % store(s).', seeded_store_count;
END $$;
