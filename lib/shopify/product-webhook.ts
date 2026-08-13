/**
 * REST-shaped Shopify product webhook helpers. Kept free of prisma/network so
 * GID and SKU extraction can be unit tested.
 */

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function variantGidFromValue(value: unknown) {
  const text = asNonEmptyString(value);
  if (text) {
    if (text.startsWith("gid://shopify/ProductVariant/")) return text;
    if (/^\d+$/.test(text)) return `gid://shopify/ProductVariant/${text}`;
    return null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return `gid://shopify/ProductVariant/${value}`;
  }
  return null;
}

function pushUnique(target: string[], value: string | null) {
  if (!value) return;
  if (!target.includes(value)) target.push(value);
}

function collectVariantGid(target: string[], value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    pushUnique(
      target,
      variantGidFromValue(record.admin_graphql_api_id) ?? variantGidFromValue(record.id),
    );
    return;
  }
  pushUnique(target, variantGidFromValue(value));
}

export type ShopifyProductWebhookRefs = {
  variantGids: string[];
  skus: string[];
};

/**
 * Reads variant GIDs and SKUs from a products/create, products/update, or
 * products/delete REST payload. `variant_gids` covers variants past the first 100.
 */
export function extractShopifyProductWebhookRefs(payload: unknown): ShopifyProductWebhookRefs {
  const variantGids: string[] = [];
  const skus: string[] = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { variantGids, skus };
  }

  const record = payload as Record<string, unknown>;
  const variants = Array.isArray(record.variants) ? record.variants : [];
  for (const variant of variants) {
    collectVariantGid(variantGids, variant);
    if (variant && typeof variant === "object" && !Array.isArray(variant)) {
      pushUnique(skus, asNonEmptyString((variant as Record<string, unknown>).sku));
    }
  }

  const variantGidsField = Array.isArray(record.variant_gids) ? record.variant_gids : [];
  for (const entry of variantGidsField) {
    collectVariantGid(variantGids, entry);
  }

  return { variantGids, skus };
}
