import assert from "node:assert/strict";
import test from "node:test";
import { extractShopifyProductWebhookRefs } from "./product-webhook.ts";

test("extracts variant GIDs and SKUs from the first 100 variants", () => {
  const refs = extractShopifyProductWebhookRefs({
    id: 11,
    admin_graphql_api_id: "gid://shopify/Product/11",
    variants: [
      {
        id: 21,
        sku: "SKU-A",
        admin_graphql_api_id: "gid://shopify/ProductVariant/21",
      },
      {
        id: "22",
        sku: " SKU-B ",
      },
    ],
  });

  assert.deepEqual(refs.variantGids, [
    "gid://shopify/ProductVariant/21",
    "gid://shopify/ProductVariant/22",
  ]);
  assert.deepEqual(refs.skus, ["SKU-A", "SKU-B"]);
});

test("includes variant_gids used once Shopify omits full variant details", () => {
  const refs = extractShopifyProductWebhookRefs({
    variants: [
      {
        id: 21,
        sku: "SKU-A",
        admin_graphql_api_id: "gid://shopify/ProductVariant/21",
      },
    ],
    variant_gids: [
      { admin_graphql_api_id: "gid://shopify/ProductVariant/21", updated_at: "2026-01-01" },
      { admin_graphql_api_id: "gid://shopify/ProductVariant/99" },
      "gid://shopify/ProductVariant/100",
    ],
  });

  assert.deepEqual(refs.variantGids, [
    "gid://shopify/ProductVariant/21",
    "gid://shopify/ProductVariant/99",
    "gid://shopify/ProductVariant/100",
  ]);
  assert.deepEqual(refs.skus, ["SKU-A"]);
});

test("returns empty refs for non-objects", () => {
  assert.deepEqual(extractShopifyProductWebhookRefs(null), { variantGids: [], skus: [] });
  assert.deepEqual(extractShopifyProductWebhookRefs("nope"), { variantGids: [], skus: [] });
  assert.deepEqual(extractShopifyProductWebhookRefs([]), { variantGids: [], skus: [] });
});
