import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  escapeSearchValue,
  shopifyGraphql,
  ShopifyApiError,
} from "@/lib/shopify/admin";
import { decryptShopifySecret } from "@/lib/shopify/encryption";

const METAFIELDS_PAGE_SIZE = 30;
const MAX_METAFIELD_PAGES = 10;

type ShopifyCredentials = {
  shopDomain: string;
  accessToken: string;
};

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

type Connection<T> = {
  nodes: T[];
  pageInfo: PageInfo;
};

type JsonRecord = Record<string, unknown>;

export type ShopifyVariantSnapshotEnvelope = {
  fetchedAt: string;
  variant?: JsonRecord;
  ambiguous?: true;
  variants?: JsonRecord[];
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableSnapshotQueryError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("access denied") ||
    message.includes("read_metaobjects") ||
    message.includes("max_cost_exceeded") ||
    message.includes("query cost")
  );
}

function metafieldSelection(includeMetaobjects: boolean) {
  if (!includeMetaobjects) {
    return `
      id
      namespace
      key
      type
      jsonValue
    `;
  }

  return `
      id
      namespace
      key
      type
      jsonValue
      reference {
        ... on Metaobject {
          id
          type
          handle
          displayName
          fields {
            key
            type
            jsonValue
            reference {
              ... on Metaobject {
                id
                type
                handle
                displayName
                fields {
                  key
                  type
                  jsonValue
                }
              }
            }
          }
        }
        ... on MediaImage {
          id
          image {
            url
            altText
          }
        }
      }
      references(first: 15) {
        nodes {
          ... on Metaobject {
            id
            type
            handle
            displayName
            fields {
              key
              type
              jsonValue
            }
          }
        }
      }
  `;
}

function variantSnapshotSelection(includeMetaobjects: boolean) {
  const metafields = metafieldSelection(includeMetaobjects);
  return `
        id
        sku
        barcode
        title
        displayName
        position
        price
        compareAtPrice
        taxable
        inventoryPolicy
        inventoryQuantity
        availableForSale
        createdAt
        updatedAt
        selectedOptions {
          name
          value
        }
        image {
          id
          url
          altText
        }
        inventoryItem {
          id
          sku
          tracked
          requiresShipping
        }
        metafields(first: ${METAFIELDS_PAGE_SIZE}) {
          nodes {
            ${metafields}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        product {
          id
          title
          handle
          status
          vendor
          productType
          tags
          description
          descriptionHtml
          createdAt
          updatedAt
          options {
            name
            optionValues {
              name
            }
          }
          featuredMedia {
            id
            alt
            ... on MediaImage {
              image {
                url
                altText
              }
            }
          }
          category {
            id
            name
            fullName
          }
          metafields(first: ${METAFIELDS_PAGE_SIZE}) {
            nodes {
              ${metafields}
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
  `;
}

function productVariantsBySkuQuery(includeMetaobjects: boolean) {
  return /* GraphQL */ `
    query ProductVariantSnapshotsBySku($query: String!, $after: String) {
      productVariants(first: 25, after: $after, query: $query) {
        nodes {
          ${variantSnapshotSelection(includeMetaobjects)}
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
}

function variantMetafieldsQuery(includeMetaobjects: boolean) {
  return /* GraphQL */ `
    query VariantMetafieldPage($id: ID!, $after: String) {
      productVariant(id: $id) {
        metafields(first: ${METAFIELDS_PAGE_SIZE}, after: $after) {
          nodes {
            ${metafieldSelection(includeMetaobjects)}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;
}

function productMetafieldsQuery(includeMetaobjects: boolean) {
  return /* GraphQL */ `
    query ProductMetafieldPage($id: ID!, $after: String) {
      product(id: $id) {
        metafields(first: ${METAFIELDS_PAGE_SIZE}, after: $after) {
          nodes {
            ${metafieldSelection(includeMetaobjects)}
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;
}

type MetafieldNode = JsonRecord & {
  references?: Connection<JsonRecord> | null;
};

type VariantSnapshotNode = JsonRecord & {
  id: string;
  sku: string | null;
  metafields?: Connection<MetafieldNode> | null;
  product?: (JsonRecord & {
    id: string;
    metafields?: Connection<MetafieldNode> | null;
  }) | null;
};

function normalizeMetafield(node: MetafieldNode): JsonRecord {
  const { references, ...rest } = node;
  if (!references) return rest;
  return { ...rest, references: references.nodes };
}

async function paginateMetafields({
  firstPage,
  fetchPage,
  includeMetaobjects,
}: {
  firstPage: Connection<MetafieldNode> | null | undefined;
  fetchPage: (
    after: string,
    includeMetaobjects: boolean,
  ) => Promise<Connection<MetafieldNode> | null | undefined>;
  includeMetaobjects: boolean;
}) {
  const nodes = [...(firstPage?.nodes ?? [])];
  let after = firstPage?.pageInfo.hasNextPage ? firstPage.pageInfo.endCursor : null;
  let pages = 1;

  while (after && pages < MAX_METAFIELD_PAGES) {
    const page = await fetchPage(after, includeMetaobjects);
    nodes.push(...(page?.nodes ?? []));
    after = page?.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    pages += 1;
  }

  return nodes.map(normalizeMetafield);
}

async function completeVariantSnapshot(
  credentials: ShopifyCredentials,
  node: VariantSnapshotNode,
  includeMetaobjects: boolean,
) {
  const variantMetafields = await paginateMetafields({
    firstPage: node.metafields,
    includeMetaobjects,
    fetchPage: async (after, include) => {
      const data = await shopifyGraphql<{
        productVariant: { metafields: Connection<MetafieldNode> | null } | null;
      }>({
        ...credentials,
        query: variantMetafieldsQuery(include),
        variables: { id: node.id, after },
      });
      return data.productVariant?.metafields;
    },
  });

  const product = node.product;
  const productMetafields = product
    ? await paginateMetafields({
        firstPage: product.metafields,
        includeMetaobjects,
        fetchPage: async (after, include) => {
          const data = await shopifyGraphql<{
            product: { metafields: Connection<MetafieldNode> | null } | null;
          }>({
            ...credentials,
            query: productMetafieldsQuery(include),
            variables: { id: product.id, after },
          });
          return data.product?.metafields;
        },
      })
    : [];

  const { metafields: _variantMetafields, product: _product, ...variantRest } = node;
  if (!product) {
    return { ...variantRest, metafields: variantMetafields, product: null };
  }

  const { metafields: _productMetafields, ...productRest } = product;
  return {
    ...variantRest,
    metafields: variantMetafields,
    product: { ...productRest, metafields: productMetafields },
  };
}

async function graphqlWithMetaobjectFallback<T>(
  credentials: ShopifyCredentials,
  buildQuery: (includeMetaobjects: boolean) => string,
  variables: Record<string, unknown>,
  includeMetaobjects: boolean,
) {
  if (!includeMetaobjects) {
    return {
      includeMetaobjects: false as const,
      data: await shopifyGraphql<T>({
        ...credentials,
        query: buildQuery(false),
        variables,
      }),
    };
  }

  try {
    return {
      includeMetaobjects: true as const,
      data: await shopifyGraphql<T>({
        ...credentials,
        query: buildQuery(true),
        variables,
      }),
    };
  } catch (error) {
    if (!(error instanceof ShopifyApiError) || !isRetryableSnapshotQueryError(error)) {
      throw error;
    }
    console.warn("[shopify-variant-snapshot] retrying GraphQL without metaobject expansions", {
      message: errorMessage(error),
    });
    return {
      includeMetaobjects: false as const,
      data: await shopifyGraphql<T>({
        ...credentials,
        query: buildQuery(false),
        variables,
      }),
    };
  }
}

async function readVariantNodesBySku(credentials: ShopifyCredentials, sku: string) {
  const searchSku = sku.trim();
  const query = `sku:'${escapeSearchValue(searchSku)}'`;
  const nodes: VariantSnapshotNode[] = [];
  let after: string | null = null;
  let includeMetaobjects = true;

  do {
    const page: {
      includeMetaobjects: boolean;
      data: {
        productVariants: {
          nodes: VariantSnapshotNode[];
          pageInfo: PageInfo;
        };
      };
    } = await graphqlWithMetaobjectFallback(
      credentials,
      productVariantsBySkuQuery,
      { query, after },
      includeMetaobjects,
    );
    includeMetaobjects = page.includeMetaobjects;
    nodes.push(...page.data.productVariants.nodes);
    after = page.data.productVariants.pageInfo.hasNextPage
      ? page.data.productVariants.pageInfo.endCursor
      : null;
  } while (after);

  const matched = nodes.filter((node) => node.sku?.trim() === searchSku);
  const snapshots: JsonRecord[] = [];
  for (const node of matched) {
    snapshots.push(await completeVariantSnapshot(credentials, node, includeMetaobjects));
  }
  return snapshots;
}

function envelopeForVariants(variants: JsonRecord[]): ShopifyVariantSnapshotEnvelope {
  const fetchedAt = new Date().toISOString();
  if (variants.length === 1) {
    return { fetchedAt, variant: variants[0] };
  }
  return { fetchedAt, ambiguous: true, variants };
}

function variantGidFromSnapshot(variant: JsonRecord | undefined) {
  return typeof variant?.id === "string" ? variant.id : null;
}

function snapshotGids(envelope: ShopifyVariantSnapshotEnvelope) {
  if (envelope.variant) {
    const gid = variantGidFromSnapshot(envelope.variant);
    return gid ? [gid] : [];
  }
  return (envelope.variants ?? [])
    .map((variant) => variantGidFromSnapshot(variant))
    .filter((gid): gid is string => Boolean(gid));
}

async function clearSnapshotRows(
  storeId: string,
  where: Prisma.ProductWhereInput,
) {
  await prisma.product.updateMany({
    where: { storeId, ...where },
    data: {
      shopifyVariant: Prisma.DbNull,
      shopifyVariantGid: null,
    },
  });
}

async function writeSnapshotToSku({
  storeId,
  sku,
  envelope,
}: {
  storeId: string;
  sku: string;
  envelope: ShopifyVariantSnapshotEnvelope;
}) {
  const gids = snapshotGids(envelope);
  if (gids.length > 0) {
    await clearSnapshotRows(storeId, {
      shopifyVariantGid: { in: gids },
      sku: { not: sku },
    });
  }

  const primaryGid = envelope.ambiguous ? null : (gids[0] ?? null);
  await prisma.product.updateMany({
    where: { storeId, sku },
    data: {
      shopifyVariant: envelope as Prisma.InputJsonValue,
      shopifyVariantGid: primaryGid,
    },
  });
}

export async function refreshShopifyVariantSnapshotForSku({
  storeId,
  shopDomain,
  accessToken,
  sku,
}: ShopifyCredentials & { storeId: string; sku: string }) {
  const trimmed = sku.trim();
  if (!trimmed) return { matched: false, variantCount: 0 };

  const variants = await readVariantNodesBySku({ shopDomain, accessToken }, trimmed);
  if (variants.length === 0) {
    await clearSnapshotRows(storeId, { sku: trimmed });
    return { matched: false, variantCount: 0 };
  }

  await writeSnapshotToSku({
    storeId,
    sku: trimmed,
    envelope: envelopeForVariants(variants),
  });
  return { matched: true, variantCount: variants.length };
}

export async function refreshShopifyVariantSnapshotsForStore({
  storeId,
  shopDomain,
  accessToken,
  skus,
}: ShopifyCredentials & { storeId: string; skus: Iterable<string> }) {
  let matchedSkuCount = 0;
  let checkedSkuCount = 0;
  const uniqueSkus = [...new Set([...skus].map((sku) => sku.trim()).filter(Boolean))];

  for (const sku of uniqueSkus) {
    const result = await refreshShopifyVariantSnapshotForSku({
      storeId,
      shopDomain,
      accessToken,
      sku,
    });
    checkedSkuCount += 1;
    if (result.matched) matchedSkuCount += 1;
    if (
      checkedSkuCount === 1 ||
      checkedSkuCount % 25 === 0 ||
      checkedSkuCount === uniqueSkus.length
    ) {
      console.info("[shopify-variant-snapshot] sku progress", {
        storeId,
        checkedSkuCount,
        skuCount: uniqueSkus.length,
        matchedSkuCount,
      });
    }
  }

  return { checkedSkuCount, matchedSkuCount };
}

export async function refreshShopifyVariantSnapshotsForWebhook({
  storeId,
  shopDomain,
  accessToken,
  variantGids,
  skus,
  deleted,
}: ShopifyCredentials & {
  storeId: string;
  variantGids: string[];
  skus: string[];
  deleted: boolean;
}) {
  const localByGid =
    variantGids.length > 0
      ? await prisma.product.findMany({
          where: { storeId, shopifyVariantGid: { in: variantGids } },
          select: { id: true, sku: true, shopifyVariantGid: true },
        })
      : [];

  const skusToRefresh = new Set<string>();
  for (const sku of skus) {
    const trimmed = sku.trim();
    if (trimmed) skusToRefresh.add(trimmed);
  }
  for (const row of localByGid) {
    const trimmed = row.sku.trim();
    if (trimmed) skusToRefresh.add(trimmed);
  }

  if (deleted) {
    if (variantGids.length > 0) {
      await clearSnapshotRows(storeId, { shopifyVariantGid: { in: variantGids } });
    }
    for (const sku of skusToRefresh) {
      await clearSnapshotRows(storeId, { sku });
    }
    return { refreshedSkuCount: 0, deleted: true };
  }

  for (const sku of skusToRefresh) {
    await refreshShopifyVariantSnapshotForSku({
      storeId,
      shopDomain,
      accessToken,
      sku,
    });
  }

  return { refreshedSkuCount: skusToRefresh.size, deleted: false };
}

export async function clearShopifyVariantSnapshotsForStore(storeId: string) {
  await clearSnapshotRows(storeId, {});
}

async function enabledShopifyCredentials(storeId: string) {
  const integration = await prisma.shopifyIntegration.findUnique({
    where: { storeId },
    select: {
      enabled: true,
      shopDomain: true,
      accessTokenEncrypted: true,
    },
  });
  if (!integration?.enabled || !integration.accessTokenEncrypted) return null;

  return {
    shopDomain: integration.shopDomain,
    accessToken: await decryptShopifySecret(integration.accessTokenEncrypted),
  };
}

/**
 * Refetch one SKU after a local product create/update. Never throws: a Shopify
 * miss must not turn a successful product save into a failed API response.
 */
export async function refreshShopifyVariantSnapshotAfterProductSave(
  storeId: string,
  sku: string | null | undefined,
) {
  const trimmed = sku?.trim();
  if (!trimmed) return;

  try {
    const credentials = await enabledShopifyCredentials(storeId);
    if (!credentials) return;

    await refreshShopifyVariantSnapshotForSku({
      storeId,
      sku: trimmed,
      ...credentials,
    });
  } catch (error) {
    console.error("[shopify-variant-snapshot] post-save refresh failed", {
      storeId,
      sku: trimmed,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Backfill every local SKU after the Shopify integration is saved enabled. */
export async function refreshShopifyVariantSnapshotsAfterIntegrationSave(storeId: string) {
  try {
    const credentials = await enabledShopifyCredentials(storeId);
    if (!credentials) return;

    const products = await prisma.product.findMany({
      where: { storeId },
      select: { sku: true },
    });
    await refreshShopifyVariantSnapshotsForStore({
      storeId,
      skus: products.map((product) => product.sku),
      ...credentials,
    });
  } catch (error) {
    console.error("[shopify-variant-snapshot] post-integration-save refresh failed", {
      storeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
