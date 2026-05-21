-- Ensure the default store has enabled Shopify and Stripe settings.
--
-- Prisma config passes these values from local initial_mock.json into
-- PostgreSQL session settings. The target rows store only pgcrypto ciphertext.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  default_store_id uuid;
  seed_user_id uuid := '00000000-0000-4000-8000-000000000001';
  shopify_webhook_signing_secret text := NULLIF(current_setting('app.initial_mock.shopify_webhook_signing_secret', true), '');
  shopify_admin_token text := NULLIF(current_setting('app.initial_mock.shopify_admin_token', true), '');
  shopify_shop_domain text := NULLIF(current_setting('app.initial_mock.shopify_shop_domain', true), '');
  stripe_secret_key text := NULLIF(current_setting('app.initial_mock.stripe_secret_key', true), '');
  stripe_webhook_signing_secret text := NULLIF(current_setting('app.initial_mock.stripe_webhook_signing_secret', true), '');
  shopify_encryption_key text := NULLIF(current_setting('app.shopify_integration_encryption_key', true), '');
  payment_provider_encryption_key text := NULLIF(current_setting('app.payment_provider_encryption_key', true), '');
BEGIN
  IF shopify_webhook_signing_secret IS NULL
    OR shopify_admin_token IS NULL
    OR shopify_shop_domain IS NULL
    OR stripe_secret_key IS NULL
    OR stripe_webhook_signing_secret IS NULL
    OR shopify_encryption_key IS NULL
    OR payment_provider_encryption_key IS NULL
  THEN
    RAISE NOTICE 'Skipping default integration settings seed because one or more required app.* session settings are missing.';
    RETURN;
  END IF;

  INSERT INTO "Store" ("id", "slug", "name", "createdAt", "updatedAt")
  VALUES (
    '4e5db5c0-0cc8-4e6a-8d40-cc5ce5131c13',
    'arcane-fortress',
    'Arcane Fortress',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("slug") DO UPDATE
  SET
    "name" = EXCLUDED."name",
    "updatedAt" = CURRENT_TIMESTAMP;

  SELECT "id" INTO default_store_id
  FROM "Store"
  WHERE "slug" = 'arcane-fortress'
  LIMIT 1;

  INSERT INTO "User" ("id", "keycloakSub", "email", "name", "type", "createdAt", "updatedAt")
  VALUES (
    seed_user_id,
    '00000000-0000-4000-8000-000000000002',
    'seed.mock@po-app.local',
    'Seed (integration settings)',
    'internal',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("keycloakSub") DO UPDATE
  SET
    "email" = EXCLUDED."email",
    "name" = EXCLUDED."name",
    "type" = 'internal',
    "updatedAt" = CURRENT_TIMESTAMP
  RETURNING "id" INTO seed_user_id;

  INSERT INTO "UserStore" ("userId", "storeId", "createdAt")
  VALUES (seed_user_id, default_store_id, CURRENT_TIMESTAMP)
  ON CONFLICT ("userId", "storeId") DO NOTHING;

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
  VALUES (
    gen_random_uuid(),
    default_store_id,
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
  )
  ON CONFLICT ("storeId") DO UPDATE
  SET
    "shopDomain" = EXCLUDED."shopDomain",
    "enabled" = true,
    "accessTokenEncrypted" = COALESCE(
      "ShopifyIntegration"."accessTokenEncrypted",
      EXCLUDED."accessTokenEncrypted"
    ),
    "webhookSecretEncrypted" = COALESCE(
      "ShopifyIntegration"."webhookSecretEncrypted",
      EXCLUDED."webhookSecretEncrypted"
    ),
    "updatedAt" = CURRENT_TIMESTAMP;

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
  VALUES (
    gen_random_uuid(),
    default_store_id,
    'stripe',
    true,
    'usd',
    'pgp:' || encode(
      pgp_sym_encrypt(
        stripe_secret_key,
        payment_provider_encryption_key || ':' || default_store_id::text,
        'cipher-algo=aes256'
      ),
      'base64'
    ),
    'pgp:' || encode(
      pgp_sym_encrypt(
        stripe_webhook_signing_secret,
        payment_provider_encryption_key || ':' || default_store_id::text,
        'cipher-algo=aes256'
      ),
      'base64'
    ),
    RIGHT(stripe_secret_key, 4),
    RIGHT(stripe_webhook_signing_secret, 4),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    seed_user_id,
    seed_user_id
  )
  ON CONFLICT ("storeId", "provider") DO UPDATE
  SET
    "enabled" = true,
    "currency" = 'usd',
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
    "updatedById" = seed_user_id,
    "updatedAt" = CURRENT_TIMESTAMP;
END $$;
