import "server-only";

export const SHOPIFY_ADMIN_API_VERSION = "2026-04";

type GraphqlError = {
  message?: string;
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
          quantities: Array<{ name: string; quantity: number }>;
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
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
  mutation CreateInventoryWebhook($uri: String!) {
    webhookSubscriptionCreate(
      topic: INVENTORY_LEVELS_UPDATE
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

function userErrorsMessage(userErrors: UserError[] | undefined) {
  if (!userErrors?.length) return null;
  return userErrors.map((error) => error.message).join("; ");
}

function escapeSearchValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function shopifyGraphql<T>({
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
  const response = await fetch(
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

  const text = await response.text();
  let payload: GraphqlResponse<T>;
  try {
    payload = JSON.parse(text) as GraphqlResponse<T>;
  } catch {
    throw new ShopifyApiError(
      response.ok
        ? "Shopify returned an invalid JSON response"
        : `Shopify request failed with HTTP ${response.status}`,
    );
  }

  if (!response.ok) {
    throw new ShopifyApiError(
      payload.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
        `Shopify request failed with HTTP ${response.status}`,
    );
  }

  if (payload.errors?.length) {
    throw new ShopifyApiError(
      payload.errors.map((error) => error.message ?? "Unknown Shopify error").join("; "),
    );
  }

  if (!payload.data) {
    throw new ShopifyApiError("Shopify returned no data");
  }

  return payload.data;
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

export async function createInventoryWebhook(input: {
  shopDomain: string;
  accessToken: string;
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
    variables: { uri: input.uri },
  });

  const message = userErrorsMessage(data.webhookSubscriptionCreate.userErrors);
  if (message) throw new ShopifyApiError(message);

  const subscription = data.webhookSubscriptionCreate.webhookSubscription;
  if (!subscription?.id) {
    throw new ShopifyApiError("Shopify did not return a webhook subscription ID");
  }
  return subscription;
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
  });

  const message = userErrorsMessage(data.webhookSubscriptionDelete.userErrors);
  if (message) throw new ShopifyApiError(message);

  return data.webhookSubscriptionDelete.deletedWebhookSubscriptionId;
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
        if (!level.isActive) continue;
        quantity +=
          level.quantities.find((entry) => entry.name === "on_hand")?.quantity ?? 0;
      }
    }

    after = data.inventoryItems.pageInfo.hasNextPage
      ? data.inventoryItems.pageInfo.endCursor
      : null;
  } while (after);

  return { sku: searchSku, quantity, itemCount };
}
