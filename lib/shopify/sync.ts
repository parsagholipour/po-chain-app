import "server-only";

import { prisma } from "@/lib/prisma";
import {
  decryptShopifySecret,
  encryptShopifySecret,
  isLegacyShopifySecret,
} from "@/lib/shopify/encryption";
import { readOnHandInventoryForSku } from "@/lib/shopify/admin";

const SYNC_LOCK_MS = 10 * 60 * 1000;

export type ShopifySyncTrigger = "scheduled" | "manual" | "webhook";

export type ShopifySyncResult = {
  integrationId: string;
  skipped: boolean;
  reason?: string;
  lockExpiresAt?: string | null;
  syncedProductCount: number;
  matchedSkuCount: number;
  unmatchedLocalSkuCount: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function elapsedMs(startedAt: number) {
  return Date.now() - startedAt;
}

function lockReason(lockUntil: Date | null) {
  return lockUntil
    ? `A Shopify inventory sync is already running until ${lockUntil.toISOString()}`
    : "A Shopify inventory sync is already running";
}

async function acquireSyncLock(integrationId: string) {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + SYNC_LOCK_MS);
  const updated = await prisma.shopifyIntegration.updateMany({
    where: {
      id: integrationId,
      OR: [{ syncLockUntil: null }, { syncLockUntil: { lt: now } }],
    },
    data: { syncLockUntil: lockUntil },
  });

  if (updated.count === 1) {
    return { status: "acquired" as const, lockUntil };
  }

  const current = await prisma.shopifyIntegration.findUnique({
    where: { id: integrationId },
    select: {
      syncLockUntil: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      updatedAt: true,
    },
  });

  if (!current) {
    return { status: "missing" as const };
  }

  return {
    status: "locked" as const,
    lockUntil: current.syncLockUntil,
    lastSyncAt: current.lastSyncAt,
    lastSyncStatus: current.lastSyncStatus,
    updatedAt: current.updatedAt,
  };
}

async function markSyncError(integrationId: string, error: unknown) {
  await prisma.shopifyIntegration.update({
    where: { id: integrationId },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: "error",
      lastSyncError: errorMessage(error).slice(0, 4000),
      syncLockUntil: null,
    },
  });
}

export async function syncShopifyIntegrationById(
  integrationId: string,
  trigger: ShopifySyncTrigger,
): Promise<ShopifySyncResult> {
  const startedAt = Date.now();
  console.info("[shopify-sync] sync requested", { integrationId, trigger });

  const lock = await acquireSyncLock(integrationId);
  if (lock.status === "missing") {
    console.warn("[shopify-sync] sync skipped; integration not found", {
      integrationId,
      trigger,
      durationMs: elapsedMs(startedAt),
    });
    return {
      integrationId,
      skipped: true,
      reason: "Shopify integration was not found",
      syncedProductCount: 0,
      matchedSkuCount: 0,
      unmatchedLocalSkuCount: 0,
    };
  }

  if (lock.status === "locked") {
    console.warn("[shopify-sync] sync skipped; lock is still active", {
      integrationId,
      trigger,
      lockUntil: lock.lockUntil?.toISOString() ?? null,
      lastSyncAt: lock.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: lock.lastSyncStatus,
      integrationUpdatedAt: lock.updatedAt.toISOString(),
      durationMs: elapsedMs(startedAt),
    });
    return {
      integrationId,
      skipped: true,
      reason: lockReason(lock.lockUntil),
      lockExpiresAt: lock.lockUntil?.toISOString() ?? null,
      syncedProductCount: 0,
      matchedSkuCount: 0,
      unmatchedLocalSkuCount: 0,
    };
  }

  console.info("[shopify-sync] lock acquired", {
    integrationId,
    trigger,
    lockUntil: lock.lockUntil.toISOString(),
  });

  try {
    const integration = await prisma.shopifyIntegration.findUnique({
      where: { id: integrationId },
      select: {
        id: true,
        storeId: true,
        shopDomain: true,
        enabled: true,
        accessTokenEncrypted: true,
      },
    });

    if (!integration) {
      console.warn("[shopify-sync] sync skipped after lock; integration not found", {
        integrationId,
        trigger,
        durationMs: elapsedMs(startedAt),
      });
      return {
        integrationId,
        skipped: true,
        reason: "Shopify integration was not found",
        syncedProductCount: 0,
        matchedSkuCount: 0,
        unmatchedLocalSkuCount: 0,
      };
    }

    if (!integration.enabled) {
      console.info("[shopify-sync] sync skipped; integration disabled", {
        integrationId,
        storeId: integration.storeId,
        trigger,
        durationMs: elapsedMs(startedAt),
      });
      await prisma.shopifyIntegration.update({
        where: { id: integration.id },
        data: { syncLockUntil: null },
      });
      return {
        integrationId,
        skipped: true,
        reason: "Shopify integration is disabled",
        syncedProductCount: 0,
        matchedSkuCount: 0,
        unmatchedLocalSkuCount: 0,
      };
    }

    if (!integration.accessTokenEncrypted) {
      console.warn("[shopify-sync] sync cannot start; access token is missing", {
        integrationId,
        storeId: integration.storeId,
        trigger,
      });
      throw new Error("Shopify access token is not configured");
    }

    const accessToken = await decryptShopifySecret(integration.accessTokenEncrypted);
    if (isLegacyShopifySecret(integration.accessTokenEncrypted)) {
      console.info("[shopify-sync] re-encrypting legacy Shopify access token", {
        integrationId,
        storeId: integration.storeId,
      });
      await prisma.shopifyIntegration.update({
        where: { id: integration.id },
        data: { accessTokenEncrypted: await encryptShopifySecret(accessToken) },
      });
    }
    const products = await prisma.product.findMany({
      where: { storeId: integration.storeId },
      select: { id: true, sku: true },
      orderBy: { sku: "asc" },
    });

    const productIdsBySku = new Map<string, string[]>();
    for (const product of products) {
      const sku = product.sku.trim();
      if (!sku) continue;
      const ids = productIdsBySku.get(sku) ?? [];
      ids.push(product.id);
      productIdsBySku.set(sku, ids);
    }

    const skuCount = productIdsBySku.size;
    console.info("[shopify-sync] local products loaded", {
      integrationId,
      storeId: integration.storeId,
      shopDomain: integration.shopDomain,
      trigger,
      productCount: products.length,
      skuCount,
    });

    let syncedProductCount = 0;
    let matchedSkuCount = 0;
    let checkedSkuCount = 0;

    for (const sku of productIdsBySku.keys()) {
      const inventory = await readOnHandInventoryForSku({
        shopDomain: integration.shopDomain,
        accessToken,
        sku,
      });
      checkedSkuCount += 1;
      const shouldLogProgress =
        checkedSkuCount === 1 ||
        checkedSkuCount % 25 === 0 ||
        checkedSkuCount === skuCount;

      if (inventory.itemCount > 0) {
        matchedSkuCount += 1;
        const productIds = productIdsBySku.get(sku) ?? [];
        syncedProductCount += productIds.length;

        await prisma.$transaction(
          productIds.map((id) =>
            prisma.product.updateMany({
              where: { id, storeId: integration.storeId },
              data: { stockCount: inventory.quantity },
            }),
          ),
        );
      }

      if (shouldLogProgress) {
        console.info("[shopify-sync] sku progress", {
          integrationId,
          trigger,
          checkedSkuCount,
          skuCount,
          matchedSkuCount,
          syncedProductCount,
        });
      }
    }

    const result = {
      integrationId,
      skipped: false,
      syncedProductCount,
      matchedSkuCount,
      unmatchedLocalSkuCount: productIdsBySku.size - matchedSkuCount,
    };

    await prisma.shopifyIntegration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: trigger,
        lastSyncError: null,
        lastSyncedProductCount: result.syncedProductCount,
        lastMatchedSkuCount: result.matchedSkuCount,
        lastUnmatchedLocalSkuCount: result.unmatchedLocalSkuCount,
        syncLockUntil: null,
      },
    });

    console.info("[shopify-sync] sync completed", {
      integrationId,
      storeId: integration.storeId,
      trigger,
      durationMs: elapsedMs(startedAt),
      syncedProductCount: result.syncedProductCount,
      matchedSkuCount: result.matchedSkuCount,
      unmatchedLocalSkuCount: result.unmatchedLocalSkuCount,
    });

    return result;
  } catch (error) {
    console.error("[shopify-sync] sync failed", {
      integrationId,
      trigger,
      durationMs: elapsedMs(startedAt),
      error: errorMessage(error),
    });
    await markSyncError(integrationId, error);
    throw error;
  }
}

export async function syncShopifyIntegrationForStore(
  storeId: string,
  trigger: ShopifySyncTrigger,
) {
  const integration = await prisma.shopifyIntegration.findUnique({
    where: { storeId },
    select: { id: true },
  });
  if (!integration) {
    return {
      integrationId: "",
      skipped: true,
      reason: "Shopify integration is not configured",
      syncedProductCount: 0,
      matchedSkuCount: 0,
      unmatchedLocalSkuCount: 0,
    };
  }
  return syncShopifyIntegrationById(integration.id, trigger);
}

export async function syncAllEnabledShopifyIntegrations() {
  const rows = await prisma.shopifyIntegration.findMany({
    where: {
      enabled: true,
      accessTokenEncrypted: { not: null },
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
  });

  const results: Array<
    ShopifySyncResult | { integrationId: string; skipped: false; error: string }
  > = [];

  for (const row of rows) {
    try {
      results.push(await syncShopifyIntegrationById(row.id, "scheduled"));
    } catch (error) {
      console.error("[shopify-sync] scheduled sync failed", row.id, error);
      results.push({
        integrationId: row.id,
        skipped: false,
        error: errorMessage(error),
      });
    }
  }

  return results;
}
