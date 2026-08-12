import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeCurrency } from "@/lib/distributor-orders/money";
import { SHOPIFY_PROVIDER, STRIPE_PROVIDER } from "@/lib/payments/providers";
import {
  getStripeCredentialsForStore,
  type StripeStoreCredentials,
} from "@/lib/payments/stripe-settings";
import { readShopifyShopCurrency } from "@/lib/shopify/admin";
import {
  decryptShopifySecret,
  encryptShopifySecret,
  isLegacyShopifySecret,
} from "@/lib/shopify/encryption";

export type ShopifyCheckoutCredentials = {
  integrationId: string;
  shopDomain: string;
  accessToken: string;
};

export type ResolvedStoreCheckoutProvider =
  | { provider: typeof STRIPE_PROVIDER; currency: string; stripe: StripeStoreCredentials }
  | {
      provider: typeof SHOPIFY_PROVIDER;
      currency: string;
      shopify: ShopifyCheckoutCredentials;
    };

type ShopifyCheckoutRow = {
  id: string;
  shopDomain: string;
  enabled: boolean;
  checkoutEnabled: boolean;
  checkoutCurrency: string | null;
  accessTokenEncrypted: string | null;
};

type EnabledShopifyCheckoutRow = ShopifyCheckoutRow & { accessTokenEncrypted: string };

async function readShopifyCheckoutRow(
  storeId: string,
): Promise<EnabledShopifyCheckoutRow | null> {
  const row = await prisma.shopifyIntegration.findUnique({
    where: { storeId },
    select: {
      id: true,
      shopDomain: true,
      enabled: true,
      checkoutEnabled: true,
      checkoutCurrency: true,
      accessTokenEncrypted: true,
    },
  });

  if (!row?.enabled || !row.checkoutEnabled || !row.accessTokenEncrypted) return null;
  return { ...row, accessTokenEncrypted: row.accessTokenEncrypted };
}

async function shopifyCredentials(
  row: EnabledShopifyCheckoutRow,
): Promise<ShopifyCheckoutCredentials> {
  const accessToken = await decryptShopifySecret(row.accessTokenEncrypted);
  if (isLegacyShopifySecret(row.accessTokenEncrypted)) {
    await prisma.shopifyIntegration.update({
      where: { id: row.id },
      data: { accessTokenEncrypted: await encryptShopifySecret(accessToken) },
    });
  }
  return { integrationId: row.id, shopDomain: row.shopDomain, accessToken };
}

/**
 * Shop currency, cached on the integration so the pricing path never has to call Shopify.
 * Populated lazily the first time checkout (or draft pricing) needs it.
 */
async function shopifyCheckoutCurrency(
  row: ShopifyCheckoutRow,
  credentials: ShopifyCheckoutCredentials,
) {
  const cached = row.checkoutCurrency?.trim();
  if (cached) return normalizeCurrency(cached);

  const currency = await readShopifyShopCurrency({
    shopDomain: credentials.shopDomain,
    accessToken: credentials.accessToken,
  });
  await prisma.shopifyIntegration.update({
    where: { id: row.id },
    data: { checkoutCurrency: currency },
  });
  return normalizeCurrency(currency);
}

/**
 * Single source of truth for which provider charges a store sale-channel order, so the
 * currency an invoice is priced in and the provider that later charges it can never disagree.
 *
 * Shopify wins when the integration is enabled, `checkoutEnabled`, and has an access token.
 * Otherwise this falls through to Stripe, which throws `PaymentProviderConfigError` when the
 * store has no Stripe configuration — the pre-existing 503 behaviour.
 */
export async function resolveStoreCheckoutProvider(
  storeId: string,
): Promise<ResolvedStoreCheckoutProvider> {
  const row = await readShopifyCheckoutRow(storeId);
  if (row) {
    const shopify = await shopifyCredentials(row);
    return {
      provider: SHOPIFY_PROVIDER,
      currency: await shopifyCheckoutCurrency(row, shopify),
      shopify,
    };
  }

  const stripe = await getStripeCredentialsForStore(storeId);
  return { provider: STRIPE_PROVIDER, currency: stripe.currency, stripe };
}

/**
 * Currency-only variant for the drafts route: avoids decrypting Stripe secrets, and avoids
 * throwing 503 for a Shopify-only tenant that has never configured Stripe.
 */
export async function resolveStoreCheckoutCurrency(storeId: string): Promise<string> {
  const row = await readShopifyCheckoutRow(storeId);
  if (row) {
    const cached = row.checkoutCurrency?.trim();
    if (cached) return normalizeCurrency(cached);
    return shopifyCheckoutCurrency(row, await shopifyCredentials(row));
  }

  return (await getStripeCredentialsForStore(storeId)).currency;
}
