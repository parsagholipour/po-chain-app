import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { shopifyIntegrationUpdateSchema } from "@/lib/validations/shopify-integration";
import {
  createInventoryWebhook,
  createShopifyWebhook,
  deleteShopifyWebhook,
  readShopifyShopCurrency,
  SHOPIFY_WEBHOOK_TOPIC,
  ShopifyApiError,
  validateShopifyAccess,
  validateShopifyCheckoutScopes,
  validateShopifyInventoryScopes,
} from "@/lib/shopify/admin";
import {
  buildShopifyInventoryWebhookUrl,
  buildShopifyOrdersPaidWebhookUrl,
  buildShopifyProductsWebhookUrl,
  normalizeShopifyDomain,
} from "@/lib/shopify/domain";
import {
  decryptShopifySecret,
  encryptShopifySecret,
  isLegacyShopifySecret,
} from "@/lib/shopify/encryption";
import { clearShopifyVariantSnapshotsForStore, refreshShopifyVariantSnapshotsAfterIntegrationSave } from "@/lib/shopify/variant-snapshot";

export const runtime = "nodejs";

function integrationResponse(row: {
  id: string;
  shopDomain: string;
  enabled: boolean;
  accessTokenEncrypted: string | null;
  webhookSecretEncrypted: string | null;
  webhookSubscriptionId: string | null;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncedProductCount: number;
  lastMatchedSkuCount: number;
  lastUnmatchedLocalSkuCount: number;
  checkoutEnabled: boolean;
  checkoutCurrency: string | null;
  checkoutLastError: string | null;
  ordersPaidWebhookSubscriptionId: string | null;
  updatedAt: Date;
} | null) {
  if (!row) {
    return {
      id: null,
      shopDomain: "",
      enabled: false,
      hasAccessToken: false,
      hasWebhookSecret: false,
      webhookSubscriptionId: null,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      lastSyncedProductCount: 0,
      lastMatchedSkuCount: 0,
      lastUnmatchedLocalSkuCount: 0,
      checkoutEnabled: false,
      checkoutCurrency: null,
      checkoutLastError: null,
      ordersPaidWebhookSubscriptionId: null,
      checkoutWebhookRegistered: false,
      updatedAt: null,
    };
  }

  return {
    id: row.id,
    shopDomain: row.shopDomain,
    enabled: row.enabled,
    hasAccessToken: row.accessTokenEncrypted != null,
    hasWebhookSecret: row.webhookSecretEncrypted != null,
    webhookSubscriptionId: row.webhookSubscriptionId,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row.lastSyncStatus,
    lastSyncError: row.lastSyncError,
    lastSyncedProductCount: row.lastSyncedProductCount,
    lastMatchedSkuCount: row.lastMatchedSkuCount,
    lastUnmatchedLocalSkuCount: row.lastUnmatchedLocalSkuCount,
    checkoutEnabled: row.checkoutEnabled,
    checkoutCurrency: row.checkoutCurrency,
    checkoutLastError: row.checkoutLastError,
    ordersPaidWebhookSubscriptionId: row.ordersPaidWebhookSubscriptionId,
    checkoutWebhookRegistered: row.ordersPaidWebhookSubscriptionId != null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function tryDeleteWebhook(input: {
  shopDomain: string;
  accessTokenEncrypted: string | null;
  subscriptionId: string | null;
}) {
  if (!input.accessTokenEncrypted || !input.subscriptionId) return null;

  try {
    await deleteShopifyWebhook({
      shopDomain: input.shopDomain,
      accessToken: await decryptShopifySecret(input.accessTokenEncrypted),
      id: input.subscriptionId,
    });
    return null;
  } catch (error) {
    console.warn("[shopify] could not delete webhook subscription", error);
    return error instanceof Error ? error.message : String(error);
  }
}

async function encryptedSecretForSave(input: {
  nextPlaintext?: string;
  existingEncrypted: string | null | undefined;
}) {
  if (input.nextPlaintext) {
    return encryptShopifySecret(input.nextPlaintext);
  }
  if (!input.existingEncrypted) return null;
  if (!isLegacyShopifySecret(input.existingEncrypted)) return input.existingEncrypted;

  return encryptShopifySecret(await decryptShopifySecret(input.existingEncrypted));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function webhookRegistrationIsRequired() {
  return process.env.NODE_ENV === "production";
}

function skippedWebhookMessage(reason: string) {
  return `${reason} Scheduled and manual Shopify inventory sync remain enabled, but Shopify webhooks were not registered.`;
}

function skippedCheckoutWebhookMessage(reason: string) {
  return `${reason} Shopify store checkout is on, but the orders/paid webhook was not registered, so paid orders are only picked up by the hourly recovery sweep.`;
}

const PRODUCT_WEBHOOK_TOPICS = [
  {
    topic: SHOPIFY_WEBHOOK_TOPIC.productsCreate,
    field: "productsCreateWebhookSubscriptionId",
  },
  {
    topic: SHOPIFY_WEBHOOK_TOPIC.productsUpdate,
    field: "productsUpdateWebhookSubscriptionId",
  },
  {
    topic: SHOPIFY_WEBHOOK_TOPIC.productsDelete,
    field: "productsDeleteWebhookSubscriptionId",
  },
] as const;

export async function GET() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const row = await prisma.shopifyIntegration.findUnique({
    where: { storeId },
  });
  return NextResponse.json(integrationResponse(row));
}

export async function PATCH(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = shopifyIntegrationUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const existing = await prisma.shopifyIntegration.findUnique({
      where: { storeId },
    });

    let nextShopDomain = normalizeShopifyDomain(parsed.data.shopDomain);
    const nextAccessTokenEncrypted = await encryptedSecretForSave({
      nextPlaintext: parsed.data.accessToken,
      existingEncrypted: existing?.accessTokenEncrypted,
    });
    const nextWebhookSecretEncrypted = await encryptedSecretForSave({
      nextPlaintext: parsed.data.webhookSecret,
      existingEncrypted: existing?.webhookSecretEncrypted,
    });

    const effectiveAccessToken =
      parsed.data.accessToken ??
      (existing?.accessTokenEncrypted
        ? await decryptShopifySecret(existing.accessTokenEncrypted)
        : null);

    if (parsed.data.enabled) {
      if (!effectiveAccessToken) {
        return jsonError("Shopify access token is required before enabling", 400);
      }
      if (webhookRegistrationIsRequired() && !nextWebhookSecretEncrypted) {
        return jsonError("Webhook signing secret is required before enabling", 400);
      }

      const shop = await validateShopifyAccess({
        shopDomain: nextShopDomain,
        accessToken: effectiveAccessToken,
      });
      nextShopDomain = normalizeShopifyDomain(shop.myshopifyDomain);
      await validateShopifyInventoryScopes({
        shopDomain: nextShopDomain,
        accessToken: effectiveAccessToken,
      });
      if (parsed.data.checkoutEnabled) {
        await validateShopifyCheckoutScopes({
          shopDomain: nextShopDomain,
          accessToken: effectiveAccessToken,
        });
      }
    }

    const saved = await prisma.shopifyIntegration.upsert({
      where: { storeId },
      create: {
        storeId,
        shopDomain: nextShopDomain,
        enabled: false,
        checkoutEnabled: false,
        accessTokenEncrypted: nextAccessTokenEncrypted,
        webhookSecretEncrypted: nextWebhookSecretEncrypted,
      },
      update: {
        shopDomain: nextShopDomain,
        enabled: false,
        checkoutEnabled: false,
        accessTokenEncrypted: nextAccessTokenEncrypted,
        webhookSecretEncrypted: nextWebhookSecretEncrypted,
      },
    });

    const previousWebhookOwner = {
      shopDomain: existing?.shopDomain ?? nextShopDomain,
      accessTokenEncrypted: existing?.accessTokenEncrypted ?? nextAccessTokenEncrypted,
    };

    if (!parsed.data.enabled) {
      const deleteError = await tryDeleteWebhook({
        ...previousWebhookOwner,
        subscriptionId: existing?.webhookSubscriptionId ?? null,
      });
      const checkoutDeleteError = await tryDeleteWebhook({
        ...previousWebhookOwner,
        subscriptionId: existing?.ordersPaidWebhookSubscriptionId ?? null,
      });
      await tryDeleteWebhook({
        ...previousWebhookOwner,
        subscriptionId: existing?.productsCreateWebhookSubscriptionId ?? null,
      });
      await tryDeleteWebhook({
        ...previousWebhookOwner,
        subscriptionId: existing?.productsUpdateWebhookSubscriptionId ?? null,
      });
      await tryDeleteWebhook({
        ...previousWebhookOwner,
        subscriptionId: existing?.productsDeleteWebhookSubscriptionId ?? null,
      });
      await clearShopifyVariantSnapshotsForStore(storeId);
      const disabled = await prisma.shopifyIntegration.update({
        where: { id: saved.id },
        data: {
          enabled: false,
          checkoutEnabled: false,
          webhookSubscriptionId: null,
          ordersPaidWebhookSubscriptionId: null,
          productsCreateWebhookSubscriptionId: null,
          productsUpdateWebhookSubscriptionId: null,
          productsDeleteWebhookSubscriptionId: null,
          lastSyncError: deleteError,
          checkoutLastError: checkoutDeleteError,
        },
      });
      return NextResponse.json(integrationResponse(disabled));
    }

    if (!effectiveAccessToken) {
      return jsonError("Shopify access token is required before enabling", 400);
    }

    await tryDeleteWebhook({
      ...previousWebhookOwner,
      subscriptionId: existing?.webhookSubscriptionId ?? null,
    });
    await tryDeleteWebhook({
      ...previousWebhookOwner,
      subscriptionId: existing?.ordersPaidWebhookSubscriptionId ?? null,
    });
    await tryDeleteWebhook({
      ...previousWebhookOwner,
      subscriptionId: existing?.productsCreateWebhookSubscriptionId ?? null,
    });
    await tryDeleteWebhook({
      ...previousWebhookOwner,
      subscriptionId: existing?.productsUpdateWebhookSubscriptionId ?? null,
    });
    await tryDeleteWebhook({
      ...previousWebhookOwner,
      subscriptionId: existing?.productsDeleteWebhookSubscriptionId ?? null,
    });
    await prisma.shopifyIntegration.update({
      where: { id: saved.id },
      data: {
        webhookSubscriptionId: null,
        ordersPaidWebhookSubscriptionId: null,
        productsCreateWebhookSubscriptionId: null,
        productsUpdateWebhookSubscriptionId: null,
        productsDeleteWebhookSubscriptionId: null,
      },
    });

    let webhookSubscriptionId: string | null = null;
    let webhookWarning: string | null = null;
    let productsCreateWebhookSubscriptionId: string | null = null;
    let productsUpdateWebhookSubscriptionId: string | null = null;
    let productsDeleteWebhookSubscriptionId: string | null = null;

    if (nextWebhookSecretEncrypted) {
      let webhookUrl: string | null = null;
      let productsWebhookUrl: string | null = null;
      try {
        webhookUrl = buildShopifyInventoryWebhookUrl(saved.id);
        productsWebhookUrl = buildShopifyProductsWebhookUrl(saved.id);
      } catch (error) {
        const message = errorMessage(error);
        if (webhookRegistrationIsRequired()) return jsonError(message, 400);
        webhookWarning = skippedWebhookMessage(message);
      }

      if (webhookUrl) {
        const webhook = await createInventoryWebhook({
          shopDomain: nextShopDomain,
          accessToken: effectiveAccessToken,
          uri: webhookUrl,
        });
        webhookSubscriptionId = webhook.id;
        // Recorded immediately: a failure in the checkout steps below must not strand a live
        // subscription that no row references, which would double-register on the next save.
        await prisma.shopifyIntegration.update({
          where: { id: saved.id },
          data: { webhookSubscriptionId },
        });
      }

      if (productsWebhookUrl) {
        const productWebhookIds: Record<(typeof PRODUCT_WEBHOOK_TOPICS)[number]["field"], string> =
          {
            productsCreateWebhookSubscriptionId: "",
            productsUpdateWebhookSubscriptionId: "",
            productsDeleteWebhookSubscriptionId: "",
          };
        for (const item of PRODUCT_WEBHOOK_TOPICS) {
          const webhook = await createShopifyWebhook({
            shopDomain: nextShopDomain,
            accessToken: effectiveAccessToken,
            topic: item.topic,
            uri: productsWebhookUrl,
          });
          productWebhookIds[item.field] = webhook.id;
          await prisma.shopifyIntegration.update({
            where: { id: saved.id },
            data: { [item.field]: webhook.id },
          });
        }
        productsCreateWebhookSubscriptionId = productWebhookIds.productsCreateWebhookSubscriptionId;
        productsUpdateWebhookSubscriptionId = productWebhookIds.productsUpdateWebhookSubscriptionId;
        productsDeleteWebhookSubscriptionId = productWebhookIds.productsDeleteWebhookSubscriptionId;
      }
    } else {
      webhookWarning = skippedWebhookMessage("Webhook signing secret is not configured.");
    }

    let checkoutCurrency: string | null = null;
    let ordersPaidWebhookSubscriptionId: string | null = null;
    let checkoutWarning: string | null = null;

    if (parsed.data.checkoutEnabled) {
      checkoutCurrency = await readShopifyShopCurrency({
        shopDomain: nextShopDomain,
        accessToken: effectiveAccessToken,
      });

      if (nextWebhookSecretEncrypted) {
        let ordersPaidWebhookUrl: string | null = null;
        try {
          ordersPaidWebhookUrl = buildShopifyOrdersPaidWebhookUrl(saved.id);
        } catch (error) {
          const message = errorMessage(error);
          if (webhookRegistrationIsRequired()) return jsonError(message, 400);
          checkoutWarning = skippedCheckoutWebhookMessage(message);
        }

        if (ordersPaidWebhookUrl) {
          const webhook = await createShopifyWebhook({
            shopDomain: nextShopDomain,
            accessToken: effectiveAccessToken,
            topic: SHOPIFY_WEBHOOK_TOPIC.ordersPaid,
            uri: ordersPaidWebhookUrl,
          });
          ordersPaidWebhookSubscriptionId = webhook.id;
          await prisma.shopifyIntegration.update({
            where: { id: saved.id },
            data: { ordersPaidWebhookSubscriptionId },
          });
        }
      } else {
        checkoutWarning = skippedCheckoutWebhookMessage(
          "Webhook signing secret is not configured.",
        );
      }
    }

    const enabled = await prisma.shopifyIntegration.update({
      where: { id: saved.id },
      data: {
        enabled: true,
        webhookSubscriptionId,
        lastSyncError: webhookWarning,
        checkoutEnabled: parsed.data.checkoutEnabled,
        checkoutCurrency,
        ordersPaidWebhookSubscriptionId,
        checkoutLastError: checkoutWarning,
        productsCreateWebhookSubscriptionId,
        productsUpdateWebhookSubscriptionId,
        productsDeleteWebhookSubscriptionId,
      },
    });

    after(() => refreshShopifyVariantSnapshotsAfterIntegrationSave(storeId));
    return NextResponse.json(integrationResponse(enabled));
  } catch (error) {
    const j = jsonFromPrisma(error);
    if (j) return j;
    if (error instanceof ShopifyApiError || error instanceof Error) {
      return jsonError(error.message, 400);
    }
    throw error;
  }
}
