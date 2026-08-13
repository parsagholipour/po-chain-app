import "server-only";

export const SHOPIFY_ADMIN_API_VERSION = "2026-04";

type GraphqlError = {
  message?: string;
  extensions?: { code?: string } | null;
};

type UserError = {
  field?: string[] | null;
  message: string;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: GraphqlError[];
};

type InventoryBySkuResponse = {
  inventoryItems: {
    nodes: Array<{
      id: string;
      sku: string | null;
      tracked: boolean;
      inventoryLevels: {
        nodes: Array<{
          id: string;
          isActive: boolean;
          location: {
            id: string;
            name: string;
            isActive: boolean;
            fulfillsOnlineOrders: boolean;
            hasActiveInventory: boolean;
            shipsInventory: boolean;
            address: {
              address1: string | null;
              address2: string | null;
              city: string | null;
              province: string | null;
              country: string | null;
              countryCode: string | null;
              zip: string | null;
              phone: string | null;
            };
          };
          quantities: Array<{ name: string; quantity: number }>;
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type InventoryLevelLocation =
  InventoryBySkuResponse["inventoryItems"]["nodes"][number]["inventoryLevels"]["nodes"][number]["location"];

type InventoryLocationAccumulator = {
  location: InventoryLevelLocation;
  onHand: number;
  inventoryItemGids: Set<string>;
  inventoryLevelGids: Set<string>;
  itemTrackedValues: Set<boolean>;
  levelActiveValues: Set<boolean>;
};

const VALIDATE_ACCESS_QUERY = /* GraphQL */ `
  query ValidateShopifyAccess {
    shop {
      id
      name
      myshopifyDomain
    }
  }
`;

const VALIDATE_INVENTORY_SCOPES_QUERY = /* GraphQL */ `
  query ValidateInventoryScopes {
    inventoryItems(first: 1) {
      nodes {
        id
        sku
      }
    }
  }
`;

const SHOP_CURRENCY_QUERY = /* GraphQL */ `
  query ShopCurrency {
    shop {
      currencyCode
    }
  }
`;

/**
 * Probes both checkout scopes in one round trip. A missing scope surfaces Shopify's own
 * "Access denied for draftOrders field. Required access: `write_draft_orders` scope." message.
 */
const VALIDATE_CHECKOUT_SCOPES_QUERY = /* GraphQL */ `
  query ValidateCheckoutScopes {
    draftOrders(first: 1) {
      nodes {
        id
      }
    }
    orders(first: 1) {
      nodes {
        id
      }
    }
  }
`;

const VALIDATE_METAOBJECT_SCOPES_QUERY = /* GraphQL */ `
  query ValidateMetaobjectScopes {
    metaobjectDefinitions(first: 1) {
      nodes {
        id
      }
    }
  }
`;

const PRODUCT_VARIANTS_BY_SKU_QUERY = /* GraphQL */ `
  query ProductVariantsBySku($query: String!, $after: String) {
    productVariants(first: 250, after: $after, query: $query) {
      nodes {
        id
        sku
        inventoryQuantity
        inventoryPolicy
        inventoryItem {
          tracked
        }
        product {
          id
          status
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const DRAFT_ORDER_FIELDS = /* GraphQL */ `
  id
  status
  ready
  invoiceUrl
  tags
  totalPriceSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  order {
    id
    name
    cancelledAt
    displayFinancialStatus
    totalPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
  }
`;

const DRAFT_ORDER_CREATE_MUTATION = /* GraphQL */ `
  mutation CreateDraftOrder($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        ${DRAFT_ORDER_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DRAFT_ORDER_QUERY = /* GraphQL */ `
  query ReadDraftOrder($id: ID!) {
    draftOrder(id: $id) {
      ${DRAFT_ORDER_FIELDS}
    }
  }
`;

const DRAFT_ORDERS_BY_QUERY = /* GraphQL */ `
  query DraftOrdersByQuery($query: String!) {
    draftOrders(first: 50, query: $query) {
      nodes {
        ${DRAFT_ORDER_FIELDS}
      }
    }
  }
`;

const DRAFT_ORDER_DELETE_MUTATION = /* GraphQL */ `
  mutation DeleteDraftOrder($input: DraftOrderDeleteInput!) {
    draftOrderDelete(input: $input) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

const INVENTORY_BY_SKU_QUERY = /* GraphQL */ `
  query InventoryBySku($query: String!, $after: String) {
    inventoryItems(first: 250, after: $after, query: $query) {
      nodes {
        id
        sku
        tracked
        inventoryLevels(first: 250) {
          nodes {
            id
            isActive
            location {
              id
              name
              isActive
              fulfillsOnlineOrders
              hasActiveInventory
              shipsInventory
              address {
                address1
                address2
                city
                province
                country
                countryCode
                zip
                phone
              }
            }
            quantities(names: ["on_hand"]) {
              name
              quantity
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const WEBHOOK_CREATE_MUTATION = /* GraphQL */ `
  mutation CreateShopifyWebhook($topic: WebhookSubscriptionTopic!, $uri: String!) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: { uri: $uri, format: JSON }
    ) {
      webhookSubscription {
        id
        topic
        uri
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** GraphQL `WebhookSubscriptionTopic` enum values this app subscribes to. */
export const SHOPIFY_WEBHOOK_TOPIC = {
  inventoryLevelsUpdate: "INVENTORY_LEVELS_UPDATE",
  ordersPaid: "ORDERS_PAID",
  productsCreate: "PRODUCTS_CREATE",
  productsUpdate: "PRODUCTS_UPDATE",
  productsDelete: "PRODUCTS_DELETE",
} as const;

export type ShopifyWebhookTopic =
  (typeof SHOPIFY_WEBHOOK_TOPIC)[keyof typeof SHOPIFY_WEBHOOK_TOPIC];

const WEBHOOK_SUBSCRIPTIONS_QUERY = /* GraphQL */ `
  query ShopifyWebhookSubscriptions($after: String) {
    webhookSubscriptions(first: 100, after: $after) {
      nodes {
        id
        topic
        uri
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const WEBHOOK_DELETE_MUTATION = /* GraphQL */ `
  mutation DeleteWebhook($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors {
        field
        message
      }
    }
  }
`;

export class ShopifyApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

/**
 * Transient failure that Shopify definitely did NOT execute (429 / THROTTLED): always safe
 * to replay, even for a mutation.
 */
class ThrottledShopifyApiError extends ShopifyApiError {}

/**
 * Transient failure where Shopify MAY already have committed the write (5xx, dropped socket).
 * Safe to replay for a query; replaying `draftOrderCreate` here would leave a second payable
 * draft order behind, so mutations opt out via `retryOn: "throttle"`.
 */
class UnsureShopifyApiError extends ShopifyApiError {}

/** Mutations only replay when Shopify certainly rejected the request unexecuted. */
export type ShopifyRetryPolicy = "all" | "throttle";

const SHOPIFY_MAX_ATTEMPTS = 4;
const SHOPIFY_RETRY_BASE_DELAY_MS = 250;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isThrottled(errors: GraphqlError[] | undefined) {
  return Boolean(errors?.some((error) => error.extensions?.code === "THROTTLED"));
}

function userErrorsMessage(userErrors: UserError[] | undefined) {
  if (!userErrors?.length) return null;
  return userErrors.map((error) => error.message).join("; ");
}

export function escapeSearchValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function singleOrNull(values: Set<string>) {
  return values.size === 1 ? [...values][0] : null;
}

function singleBooleanOrNull(values: Set<boolean>) {
  return values.size === 1 ? [...values][0] : null;
}

async function shopifyGraphqlOnce<T>({
  shopDomain,
  accessToken,
  query,
  variables,
}: {
  shopDomain: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}) {
  let response: Response;
  try {
    response = await fetch(
      `https://${shopDomain}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
    );
  } catch (error) {
    throw new UnsureShopifyApiError(
      `Could not reach Shopify: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  let payload: GraphqlResponse<T>;
  try {
    payload = JSON.parse(text) as GraphqlResponse<T>;
  } catch {
    if (!response.ok) {
      const message = `Shopify request failed with HTTP ${response.status}`;
      if (response.status === 429) throw new ThrottledShopifyApiError(message);
      if (response.status >= 500) throw new UnsureShopifyApiError(message);
      throw new ShopifyApiError(message);
    }
    throw new ShopifyApiError("Shopify returned an invalid JSON response");
  }

  if (!response.ok) {
    const message =
      payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
      `Shopify request failed with HTTP ${response.status}`;
    if (response.status === 429) throw new ThrottledShopifyApiError(message);
    if (response.status >= 500) throw new UnsureShopifyApiError(message);
    throw new ShopifyApiError(message);
  }

  if (payload.errors?.length) {
    const message = payload.errors
      .map((error) => error.message ?? "Unknown Shopify error")
      .join("; ");
    if (isThrottled(payload.errors)) {
      throw new ThrottledShopifyApiError(message);
    }
    throw new ShopifyApiError(message);
  }

  if (!payload.data) {
    throw new ShopifyApiError("Shopify returned no data");
  }

  return payload.data;
}

export async function shopifyGraphql<T>({
  maxAttempts = SHOPIFY_MAX_ATTEMPTS,
  retryOn = "all",
  ...input
}: {
  shopDomain: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
  maxAttempts?: number;
  retryOn?: ShopifyRetryPolicy;
}) {
  const attempts = Math.max(1, maxAttempts);
  let lastError: ShopifyApiError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(SHOPIFY_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
    try {
      return await shopifyGraphqlOnce<T>(input);
    } catch (error) {
      const retryable =
        error instanceof ThrottledShopifyApiError ||
        (retryOn === "all" && error instanceof UnsureShopifyApiError);
      if (!retryable) throw error;
      lastError = error as ShopifyApiError;
    }
  }

  throw lastError ?? new ShopifyApiError("Shopify request failed");
}

export async function validateShopifyAccess(input: {
  shopDomain: string;
  accessToken: string;
}) {
  const data = await shopifyGraphql<{
    shop: { id: string; name: string; myshopifyDomain: string };
  }>({
    ...input,
    query: VALIDATE_ACCESS_QUERY,
  });

  return data.shop;
}

export async function validateShopifyInventoryScopes(input: {
  shopDomain: string;
  accessToken: string;
}) {
  await shopifyGraphql<{
    inventoryItems: {
      nodes: Array<{ id: string; sku: string | null }>;
    };
  }>({
    ...input,
    query: VALIDATE_INVENTORY_SCOPES_QUERY,
  });
}

/** Shop currency, lowercased to match how this app stores `Invoice.currency`. */
export async function readShopifyShopCurrency(input: {
  shopDomain: string;
  accessToken: string;
}) {
  const data = await shopifyGraphql<{ shop: { currencyCode: string } }>({
    ...input,
    query: SHOP_CURRENCY_QUERY,
  });

  const currency = data.shop.currencyCode?.trim().toLowerCase();
  if (!currency) throw new ShopifyApiError("Shopify did not return a shop currency");
  return currency;
}

export async function validateShopifyCheckoutScopes(input: {
  shopDomain: string;
  accessToken: string;
}) {
  await shopifyGraphql<{
    draftOrders: { nodes: Array<{ id: string }> };
    orders: { nodes: Array<{ id: string }> };
  }>({
    ...input,
    query: VALIDATE_CHECKOUT_SCOPES_QUERY,
  });
}

export async function validateShopifyMetaobjectScopes(input: {
  shopDomain: string;
  accessToken: string;
}) {
  await shopifyGraphql<{
    metaobjectDefinitions: { nodes: Array<{ id: string }> };
  }>({
    ...input,
    query: VALIDATE_METAOBJECT_SCOPES_QUERY,
  });
}

export type ShopifyProductVariant = {
  id: string;
  sku: string | null;
  inventoryQuantity: number | null;
  inventoryPolicy: string | null;
  inventoryItem: { tracked: boolean | null } | null;
  product: { id: string; status: string | null } | null;
};

/**
 * Shopify's `sku:` search is fuzzy, so callers must re-filter on exact trimmed SKU
 * (same guard as `readOnHandInventoryForSku`).
 */
export async function productVariantsBySku(input: {
  shopDomain: string;
  accessToken: string;
  query: string;
}) {
  const nodes: ShopifyProductVariant[] = [];
  let after: string | null = null;

  do {
    const data: {
      productVariants: {
        nodes: ShopifyProductVariant[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await shopifyGraphql({
      shopDomain: input.shopDomain,
      accessToken: input.accessToken,
      query: PRODUCT_VARIANTS_BY_SKU_QUERY,
      variables: { query: input.query, after },
    });

    nodes.push(...data.productVariants.nodes);
    after = data.productVariants.pageInfo.hasNextPage
      ? data.productVariants.pageInfo.endCursor
      : null;
  } while (after);

  return nodes;
}

type ShopifyMoneyBag = { shopMoney: { amount: string; currencyCode: string } } | null;

export type ShopifyDraftOrder = {
  id: string;
  status: string | null;
  ready: boolean | null;
  invoiceUrl: string | null;
  tags: string[] | null;
  totalPriceSet: ShopifyMoneyBag;
  order: {
    id: string;
    name: string | null;
    cancelledAt: string | null;
    /** `OrderDisplayFinancialStatus`: PAID / PENDING / AUTHORIZED / REFUNDED / … */
    displayFinancialStatus: string | null;
    totalPriceSet: ShopifyMoneyBag;
  } | null;
};

export async function createShopifyDraftOrder(input: {
  shopDomain: string;
  accessToken: string;
  input: Record<string, unknown>;
}) {
  const data = await shopifyGraphql<{
    draftOrderCreate: {
      draftOrder: ShopifyDraftOrder | null;
      userErrors: UserError[];
    };
  }>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    query: DRAFT_ORDER_CREATE_MUTATION,
    variables: { input: input.input },
    retryOn: "throttle",
  });

  const message = userErrorsMessage(data.draftOrderCreate.userErrors);
  if (message) throw new ShopifyApiError(message);

  const draftOrder = data.draftOrderCreate.draftOrder;
  if (!draftOrder?.id) {
    throw new ShopifyApiError("Shopify did not return a draft order");
  }
  return draftOrder;
}

export async function readShopifyDraftOrder(input: {
  shopDomain: string;
  accessToken: string;
  id: string;
}) {
  const data = await shopifyGraphql<{ draftOrder: ShopifyDraftOrder | null }>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    query: DRAFT_ORDER_QUERY,
    variables: { id: input.id },
  });

  return data.draftOrder;
}

export async function findShopifyDraftOrders(input: {
  shopDomain: string;
  accessToken: string;
  query: string;
}) {
  const data = await shopifyGraphql<{ draftOrders: { nodes: ShopifyDraftOrder[] } }>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    query: DRAFT_ORDERS_BY_QUERY,
    variables: { query: input.query },
  });

  return data.draftOrders.nodes;
}

export async function deleteShopifyDraftOrder(input: {
  shopDomain: string;
  accessToken: string;
  id: string;
}) {
  const data = await shopifyGraphql<{
    draftOrderDelete: {
      deletedId: string | null;
      userErrors: UserError[];
    };
  }>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    query: DRAFT_ORDER_DELETE_MUTATION,
    variables: { input: { id: input.id } },
    retryOn: "throttle",
  });

  const message = userErrorsMessage(data.draftOrderDelete.userErrors);
  if (message) throw new ShopifyApiError(message);

  return data.draftOrderDelete.deletedId;
}

export async function createShopifyWebhook(input: {
  shopDomain: string;
  accessToken: string;
  topic: ShopifyWebhookTopic;
  uri: string;
}) {
  const data = await shopifyGraphql<{
    webhookSubscriptionCreate: {
      webhookSubscription: { id: string; topic: string; uri: string } | null;
      userErrors: UserError[];
    };
  }>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    query: WEBHOOK_CREATE_MUTATION,
    variables: { topic: input.topic, uri: input.uri },
    retryOn: "throttle",
  });

  const message = userErrorsMessage(data.webhookSubscriptionCreate.userErrors);
  if (message) throw new ShopifyApiError(message);

  const subscription = data.webhookSubscriptionCreate.webhookSubscription;
  if (!subscription?.id) {
    throw new ShopifyApiError("Shopify did not return a webhook subscription ID");
  }
  return subscription;
}

export async function createInventoryWebhook(input: {
  shopDomain: string;
  accessToken: string;
  uri: string;
}) {
  return createShopifyWebhook({
    ...input,
    topic: SHOPIFY_WEBHOOK_TOPIC.inventoryLevelsUpdate,
  });
}

export async function deleteInventoryWebhook(input: {
  shopDomain: string;
  accessToken: string;
  id: string;
}) {
  const data = await shopifyGraphql<{
    webhookSubscriptionDelete: {
      deletedWebhookSubscriptionId: string | null;
      userErrors: UserError[];
    };
  }>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    query: WEBHOOK_DELETE_MUTATION,
    variables: { id: input.id },
    retryOn: "throttle",
  });

  const message = userErrorsMessage(data.webhookSubscriptionDelete.userErrors);
  if (message) throw new ShopifyApiError(message);

  return data.webhookSubscriptionDelete.deletedWebhookSubscriptionId;
}

/** The delete mutation is topic-agnostic; this alias documents that at the call site. */
export const deleteShopifyWebhook = deleteInventoryWebhook;

export type ShopifyWebhookSubscription = {
  id: string;
  topic: string;
  callbackUrl: string | null;
};

/**
 * What Shopify actually has registered, which can drift from what this app recorded:
 * Shopify deletes a subscription after 8 consecutive non-2xx deliveries, without telling us.
 */
export async function listShopifyWebhooks(input: {
  shopDomain: string;
  accessToken: string;
}) {
  const subscriptions: ShopifyWebhookSubscription[] = [];
  let after: string | null = null;

  do {
    const data: {
      webhookSubscriptions: {
        nodes: Array<{ id: string; topic: string; uri: string | null }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await shopifyGraphql({
      shopDomain: input.shopDomain,
      accessToken: input.accessToken,
      query: WEBHOOK_SUBSCRIPTIONS_QUERY,
      variables: { after },
    });

    for (const node of data.webhookSubscriptions.nodes) {
      subscriptions.push({ id: node.id, topic: node.topic, callbackUrl: node.uri ?? null });
    }

    after = data.webhookSubscriptions.pageInfo.hasNextPage
      ? data.webhookSubscriptions.pageInfo.endCursor
      : null;
  } while (after);

  return subscriptions;
}

export async function readOnHandInventoryForSku(input: {
  shopDomain: string;
  accessToken: string;
  sku: string;
}) {
  const searchSku = input.sku.trim();
  const inventoryQuery = `sku:'${escapeSearchValue(searchSku)}'`;
  let after: string | null = null;
  let quantity = 0;
  let itemCount = 0;
  const levelsByLocation = new Map<string, InventoryLocationAccumulator>();

  do {
    const data: InventoryBySkuResponse = await shopifyGraphql<InventoryBySkuResponse>({
      shopDomain: input.shopDomain,
      accessToken: input.accessToken,
      query: INVENTORY_BY_SKU_QUERY,
      variables: { query: inventoryQuery, after },
    });

    for (const item of data.inventoryItems.nodes) {
      if (item.sku?.trim() !== searchSku) continue;
      itemCount += 1;
      for (const level of item.inventoryLevels.nodes) {
        const onHand =
          level.quantities.find((entry) => entry.name === "on_hand")?.quantity ?? 0;
        if (!level.isActive) continue;
        quantity += onHand;
      }

      for (const level of item.inventoryLevels.nodes) {
        const onHand =
          level.quantities.find((entry) => entry.name === "on_hand")?.quantity ?? 0;
        const current =
          levelsByLocation.get(level.location.id) ??
          {
            location: level.location,
            onHand: 0,
            inventoryItemGids: new Set<string>(),
            inventoryLevelGids: new Set<string>(),
            itemTrackedValues: new Set<boolean>(),
            levelActiveValues: new Set<boolean>(),
          };

        current.location = level.location;
        current.onHand += onHand;
        current.inventoryItemGids.add(item.id);
        current.inventoryLevelGids.add(level.id);
        current.itemTrackedValues.add(item.tracked);
        current.levelActiveValues.add(level.isActive);
        levelsByLocation.set(level.location.id, current);
      }
    }

    after = data.inventoryItems.pageInfo.hasNextPage
      ? data.inventoryItems.pageInfo.endCursor
      : null;
  } while (after);

  return {
    sku: searchSku,
    quantity,
    itemCount,
    levels: [...levelsByLocation.values()].map((level) => ({
      location: {
        shopifyLocationGid: level.location.id,
        name: level.location.name,
        isActive: level.location.isActive,
        fulfillsOnlineOrders: level.location.fulfillsOnlineOrders,
        hasActiveInventory: level.location.hasActiveInventory,
        shipsInventory: level.location.shipsInventory,
        address1: level.location.address.address1,
        address2: level.location.address.address2,
        city: level.location.address.city,
        province: level.location.address.province,
        country: level.location.address.country,
        countryCode: level.location.address.countryCode,
        zip: level.location.address.zip,
        phone: level.location.address.phone,
      },
      onHand: level.onHand,
      shopifyInventoryItemGid: singleOrNull(level.inventoryItemGids),
      shopifyInventoryLevelGid: singleOrNull(level.inventoryLevelGids),
      shopifyInventoryItemTracked: singleBooleanOrNull(level.itemTrackedValues),
      inventoryLevelActive: singleBooleanOrNull(level.levelActiveValues),
    })),
  };
}
