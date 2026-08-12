import "server-only";

import { prisma } from "@/lib/prisma";
import { SHOPIFY_PROVIDER } from "@/lib/payments/providers";
import {
  listShopifyWebhooks,
  readShopifyShopCurrency,
  SHOPIFY_WEBHOOK_TOPIC,
  validateShopifyAccess,
  validateShopifyCheckoutScopes,
  validateShopifyInventoryScopes,
  type ShopifyWebhookSubscription,
} from "@/lib/shopify/admin";
import { checkoutTtlMinutes } from "@/lib/shopify/checkout-sweeper";
import {
  buildShopifyInventoryWebhookUrl,
  buildShopifyOrdersPaidWebhookUrl,
} from "@/lib/shopify/domain";
import { decryptShopifySecret } from "@/lib/shopify/encryption";

export type ShopifyHealthCheckStatus = "ok" | "warning" | "error" | "skipped";

export type ShopifyHealthCheck = {
  key: string;
  label: string;
  status: ShopifyHealthCheckStatus;
  detail: string;
  /** What to do about it; only set when the check is not ok. */
  hint: string | null;
};

export type ShopifyIntegrationHealth = {
  checkedAt: string;
  durationMs: number;
  status: "ok" | "warning" | "error" | "not_configured";
  checks: ShopifyHealthCheck[];
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function relativeTime(value: Date | null) {
  if (!value) return "never";
  const minutes = Math.max(0, Math.round((Date.now() - value.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * Compares one topic against what Shopify actually has registered. A missing subscription is
 * the failure this is built for: after 8 consecutive non-2xx deliveries Shopify deletes it,
 * and nothing else in the app would ever notice.
 */
function webhookCheck({
  key,
  label,
  topic,
  recordedId,
  expectedUrl,
  expectedUrlError,
  subscriptions,
}: {
  key: string;
  label: string;
  topic: string;
  recordedId: string | null;
  expectedUrl: string | null;
  expectedUrlError: string | null;
  subscriptions: ShopifyWebhookSubscription[] | null;
}): ShopifyHealthCheck {
  if (!subscriptions) {
    return {
      key,
      label,
      status: "warning",
      detail: "Could not read the webhook list from Shopify",
      hint: "Check the Admin API access token and its scopes.",
    };
  }

  const matches = subscriptions.filter((row) => row.topic === topic);
  if (matches.length === 0) {
    return {
      key,
      label,
      status: "error",
      detail: recordedId
        ? `This app recorded a subscription, but Shopify has none for ${topic}`
        : `No ${topic} subscription is registered in Shopify`,
      hint: recordedId
        ? "Shopify deletes a subscription after 8 consecutive failed deliveries. Save the integration again to re-register it."
        : "Save the integration again to register it.",
    };
  }

  const byRecordedId = matches.find((row) => row.id === recordedId);
  const subscription = byRecordedId ?? matches[0];

  if (expectedUrlError) {
    return {
      key,
      label,
      status: "warning",
      detail: `Registered in Shopify, delivering to ${subscription.callbackUrl ?? "an unknown endpoint"}`,
      hint: `This app cannot compute its own callback URL to compare: ${expectedUrlError}`,
    };
  }

  if (expectedUrl && subscription.callbackUrl !== expectedUrl) {
    return {
      key,
      label,
      status: "error",
      detail: `Shopify delivers to ${subscription.callbackUrl ?? "an unknown endpoint"}`,
      hint: `Deliveries are not reaching this app, which expects ${expectedUrl}. Save the integration again to re-register it.`,
    };
  }

  if (!byRecordedId) {
    return {
      key,
      label,
      status: "warning",
      detail: `Registered in Shopify (${subscription.id}) but this app recorded ${recordedId ?? "none"}`,
      hint: "Save the integration again so both sides agree; duplicate subscriptions deliver twice.",
    };
  }

  if (matches.length > 1) {
    return {
      key,
      label,
      status: "warning",
      detail: `${matches.length} ${topic} subscriptions are registered`,
      hint: "Duplicates deliver the same event more than once. Remove the extras in Shopify.",
    };
  }

  return {
    key,
    label,
    status: "ok",
    detail: `Registered and delivering to ${subscription.callbackUrl}`,
    hint: null,
  };
}

async function checkoutActivityCheck(storeId: string): Promise<ShopifyHealthCheck> {
  const staleCutoff = new Date(Date.now() - checkoutTtlMinutes() * 60_000);
  const [pending, stale, lastEvent, lastPaid] = await Promise.all([
    prisma.paymentAttempt.count({
      where: { storeId, provider: SHOPIFY_PROVIDER, status: "pending" },
    }),
    prisma.paymentAttempt.count({
      where: {
        storeId,
        provider: SHOPIFY_PROVIDER,
        status: "pending",
        createdAt: { lt: staleCutoff },
      },
    }),
    prisma.paymentWebhookEvent.findFirst({
      where: { storeId, provider: SHOPIFY_PROVIDER },
      orderBy: { processedAt: "desc" },
      select: { processedAt: true },
    }),
    prisma.paymentAttempt.findFirst({
      where: { storeId, provider: SHOPIFY_PROVIDER, status: "paid" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  const detail = [
    `${pending} checkout${pending === 1 ? "" : "s"} awaiting payment`,
    `last paid order ${relativeTime(lastPaid?.updatedAt ?? null)}`,
    `last Shopify payment event ${relativeTime(lastEvent?.processedAt ?? null)}`,
  ].join(" · ");

  return {
    key: "checkout_activity",
    label: "Checkout activity",
    status: stale > 0 ? "warning" : "ok",
    detail,
    hint:
      stale > 0
        ? `${stale} checkout${stale === 1 ? " has" : "s have"} been pending longer than ${checkoutTtlMinutes()} minutes. The hourly sweep will delete the abandoned draft orders and recover any that were actually paid.`
        : null,
  };
}

/**
 * Probes Shopify live rather than reporting what the database believes, because every
 * interesting failure here (revoked scope, deleted subscription, stale tunnel URL, changed
 * shop currency) leaves our own columns looking perfectly healthy.
 */
export async function checkShopifyIntegrationHealth(
  storeId: string,
): Promise<ShopifyIntegrationHealth> {
  const startedAt = Date.now();
  const checks: ShopifyHealthCheck[] = [];

  const finish = (status: ShopifyIntegrationHealth["status"]) => ({
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    status,
    checks,
  });

  const integration = await prisma.shopifyIntegration.findUnique({
    where: { storeId },
    select: {
      id: true,
      shopDomain: true,
      enabled: true,
      checkoutEnabled: true,
      checkoutCurrency: true,
      accessTokenEncrypted: true,
      webhookSecretEncrypted: true,
      webhookSubscriptionId: true,
      ordersPaidWebhookSubscriptionId: true,
    },
  });

  if (!integration || !integration.accessTokenEncrypted) {
    checks.push({
      key: "integration",
      label: "Integration",
      status: "skipped",
      detail: "Shopify is not configured for this store",
      hint: "Add a shop domain and Admin API token, then save.",
    });
    return finish("not_configured");
  }

  checks.push({
    key: "integration",
    label: "Integration",
    status: integration.enabled ? "ok" : "warning",
    detail: integration.enabled
      ? `Enabled for ${integration.shopDomain}`
      : `Saved for ${integration.shopDomain} but disabled`,
    hint: integration.enabled ? null : "Tick Enabled and save to start syncing.",
  });

  let accessToken: string;
  try {
    accessToken = await decryptShopifySecret(integration.accessTokenEncrypted);
  } catch (error) {
    checks.push({
      key: "admin_api",
      label: "Admin API access",
      status: "error",
      detail: `Could not decrypt the stored Admin API token: ${errorMessage(error)}`,
      hint: "Re-enter the Admin API token and save.",
    });
    return finish("error");
  }

  const credentials = { shopDomain: integration.shopDomain, accessToken };

  try {
    const shop = await validateShopifyAccess(credentials);
    checks.push({
      key: "admin_api",
      label: "Admin API access",
      status: "ok",
      detail: `Connected to ${shop.name} (${shop.myshopifyDomain})`,
      hint: null,
    });
  } catch (error) {
    checks.push({
      key: "admin_api",
      label: "Admin API access",
      status: "error",
      detail: errorMessage(error),
      hint: "The Admin API token is invalid, revoked, or belongs to another shop.",
    });
    return finish("error");
  }

  checks.push({
    key: "webhook_secret",
    label: "Webhook signing secret",
    status: integration.webhookSecretEncrypted ? "ok" : "error",
    detail: integration.webhookSecretEncrypted
      ? "Configured; both webhook topics are signed with it"
      : "Not configured, so no webhook can be verified",
    hint: integration.webhookSecretEncrypted
      ? null
      : "Paste the app's API secret key into Webhook signing secret and save.",
  });

  try {
    await validateShopifyInventoryScopes(credentials);
    checks.push({
      key: "inventory_scopes",
      label: "Inventory scopes",
      status: "ok",
      detail: "read_products and read_inventory are granted",
      hint: null,
    });
  } catch (error) {
    checks.push({
      key: "inventory_scopes",
      label: "Inventory scopes",
      status: "error",
      detail: errorMessage(error),
      hint: "Grant read_products and read_inventory to the app in Shopify, then reinstall it.",
    });
  }

  let subscriptions: ShopifyWebhookSubscription[] | null = null;
  try {
    subscriptions = await listShopifyWebhooks(credentials);
  } catch (error) {
    console.warn("[shopify-health] could not list webhook subscriptions", errorMessage(error));
  }

  const expectedUrl = (build: (id: string) => string) => {
    try {
      return { url: build(integration.id), error: null };
    } catch (error) {
      return { url: null, error: errorMessage(error) };
    }
  };

  const inventoryUrl = expectedUrl(buildShopifyInventoryWebhookUrl);
  checks.push(
    webhookCheck({
      key: "inventory_webhook",
      label: "Inventory webhook",
      topic: SHOPIFY_WEBHOOK_TOPIC.inventoryLevelsUpdate,
      recordedId: integration.webhookSubscriptionId,
      expectedUrl: inventoryUrl.url,
      expectedUrlError: inventoryUrl.error,
      subscriptions,
    }),
  );

  if (!integration.checkoutEnabled) {
    checks.push({
      key: "checkout",
      label: "Store checkout",
      status: "skipped",
      detail: "Off; store orders are charged through Stripe",
      hint: null,
    });
    return finish(worstStatus(checks));
  }

  checks.push({
    key: "checkout",
    label: "Store checkout",
    status: "ok",
    detail: "On; store orders are charged through Shopify draft orders",
    hint: null,
  });

  try {
    await validateShopifyCheckoutScopes(credentials);
    checks.push({
      key: "checkout_scopes",
      label: "Checkout scopes",
      status: "ok",
      detail: "write_draft_orders and read_orders are granted",
      hint: null,
    });
  } catch (error) {
    checks.push({
      key: "checkout_scopes",
      label: "Checkout scopes",
      status: "error",
      detail: errorMessage(error),
      hint: "Grant write_draft_orders and read_orders to the app in Shopify, then reinstall it. Checkout cannot create draft orders without them.",
    });
  }

  const ordersPaidUrl = expectedUrl(buildShopifyOrdersPaidWebhookUrl);
  checks.push(
    webhookCheck({
      key: "orders_paid_webhook",
      label: "Payment webhook (orders/paid)",
      topic: SHOPIFY_WEBHOOK_TOPIC.ordersPaid,
      recordedId: integration.ordersPaidWebhookSubscriptionId,
      expectedUrl: ordersPaidUrl.url,
      expectedUrlError: ordersPaidUrl.error,
      subscriptions,
    }),
  );

  try {
    const liveCurrency = await readShopifyShopCurrency(credentials);
    const cached = integration.checkoutCurrency?.trim().toLowerCase() || null;
    checks.push({
      key: "checkout_currency",
      label: "Checkout currency",
      status: !cached ? "warning" : cached === liveCurrency ? "ok" : "error",
      detail: !cached
        ? `Shopify charges in ${liveCurrency.toUpperCase()}; nothing is cached yet`
        : cached === liveCurrency
          ? `${liveCurrency.toUpperCase()}, matching the shop`
          : `Orders are priced in ${cached.toUpperCase()} but the shop now charges in ${liveCurrency.toUpperCase()}`,
      hint:
        cached && cached !== liveCurrency
          ? "Save the integration again to re-cache it. Orders priced in the old currency will be rejected at checkout rather than charged wrongly."
          : null,
    });
  } catch (error) {
    checks.push({
      key: "checkout_currency",
      label: "Checkout currency",
      status: "warning",
      detail: errorMessage(error),
      hint: null,
    });
  }

  checks.push(await checkoutActivityCheck(storeId));

  return finish(worstStatus(checks));
}

function worstStatus(checks: ShopifyHealthCheck[]): ShopifyIntegrationHealth["status"] {
  if (checks.some((check) => check.status === "error")) return "error";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "ok";
}
