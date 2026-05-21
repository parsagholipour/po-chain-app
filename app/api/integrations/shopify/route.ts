import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { shopifyIntegrationUpdateSchema } from "@/lib/validations/shopify-integration";
import {
  createInventoryWebhook,
  deleteInventoryWebhook,
  ShopifyApiError,
  validateShopifyAccess,
  validateShopifyInventoryScopes,
} from "@/lib/shopify/admin";
import { buildShopifyInventoryWebhookUrl, normalizeShopifyDomain } from "@/lib/shopify/domain";
import {
  decryptShopifySecret,
  encryptShopifySecret,
  isLegacyShopifySecret,
} from "@/lib/shopify/encryption";

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
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function tryDeleteWebhook(input: {
  shopDomain: string;
  accessTokenEncrypted: string | null;
  webhookSubscriptionId: string | null;
}) {
  if (!input.accessTokenEncrypted || !input.webhookSubscriptionId) return null;

  try {
    await deleteInventoryWebhook({
      shopDomain: input.shopDomain,
      accessToken: await decryptShopifySecret(input.accessTokenEncrypted),
      id: input.webhookSubscriptionId,
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
    }

    const saved = await prisma.shopifyIntegration.upsert({
      where: { storeId },
      create: {
        storeId,
        shopDomain: nextShopDomain,
        enabled: false,
        accessTokenEncrypted: nextAccessTokenEncrypted,
        webhookSecretEncrypted: nextWebhookSecretEncrypted,
      },
      update: {
        shopDomain: nextShopDomain,
        enabled: false,
        accessTokenEncrypted: nextAccessTokenEncrypted,
        webhookSecretEncrypted: nextWebhookSecretEncrypted,
      },
    });

    if (!parsed.data.enabled) {
      const deleteError = await tryDeleteWebhook({
        shopDomain: existing?.shopDomain ?? nextShopDomain,
        accessTokenEncrypted: existing?.accessTokenEncrypted ?? nextAccessTokenEncrypted,
        webhookSubscriptionId: existing?.webhookSubscriptionId ?? null,
      });
      const disabled = await prisma.shopifyIntegration.update({
        where: { id: saved.id },
        data: {
          enabled: false,
          webhookSubscriptionId: null,
          lastSyncError: deleteError,
        },
      });
      return NextResponse.json(integrationResponse(disabled));
    }

    if (!effectiveAccessToken) {
      return jsonError("Shopify access token is required before enabling", 400);
    }

    await tryDeleteWebhook({
      shopDomain: existing?.shopDomain ?? nextShopDomain,
      accessTokenEncrypted: existing?.accessTokenEncrypted ?? nextAccessTokenEncrypted,
      webhookSubscriptionId: existing?.webhookSubscriptionId ?? null,
    });
    await prisma.shopifyIntegration.update({
      where: { id: saved.id },
      data: { webhookSubscriptionId: null },
    });

    let webhookSubscriptionId: string | null = null;
    let webhookWarning: string | null = null;

    if (nextWebhookSecretEncrypted) {
      let webhookUrl: string | null = null;
      try {
        webhookUrl = buildShopifyInventoryWebhookUrl(saved.id);
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
      }
    } else {
      webhookWarning = skippedWebhookMessage("Webhook signing secret is not configured.");
    }

    const enabled = await prisma.shopifyIntegration.update({
      where: { id: saved.id },
      data: {
        enabled: true,
        webhookSubscriptionId,
        lastSyncError: webhookWarning,
      },
    });

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
