import "server-only";

import { randomUUID } from "crypto";
import type { Prisma } from "@/app/generated/prisma/client";
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
  syncedLocationCount: number;
  syncedInventoryCount: number;
  movementCount: number;
};

type LocalProduct = {
  id: string;
  name: string;
  sku: string;
};

type ShopifyInventoryForSku = Awaited<ReturnType<typeof readOnHandInventoryForSku>>;
type ShopifyInventoryLevel = ShopifyInventoryForSku["levels"][number];

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

function emptySyncResult(
  integrationId: string,
  overrides: Partial<ShopifySyncResult> = {},
): ShopifySyncResult {
  return {
    integrationId,
    skipped: true,
    syncedProductCount: 0,
    matchedSkuCount: 0,
    unmatchedLocalSkuCount: 0,
    syncedLocationCount: 0,
    syncedInventoryCount: 0,
    movementCount: 0,
    ...overrides,
  };
}

function locationData(level: ShopifyInventoryLevel, observedAt: Date) {
  return {
    shopifyLocationGid: level.location.shopifyLocationGid,
    name: level.location.name,
    isActive: level.location.isActive,
    fulfillsOnlineOrders: level.location.fulfillsOnlineOrders,
    hasActiveInventory: level.location.hasActiveInventory,
    shipsInventory: level.location.shipsInventory,
    address1: level.location.address1,
    address2: level.location.address2,
    city: level.location.city,
    province: level.location.province,
    country: level.location.country,
    countryCode: level.location.countryCode,
    zip: level.location.zip,
    phone: level.location.phone,
    lastSeenAt: observedAt,
  };
}

function countData({
  storeId,
  productId,
  shopifyLocationId,
  level,
  trigger,
  observedAt,
}: {
  storeId: string;
  productId: string;
  shopifyLocationId: string;
  level: ShopifyInventoryLevel;
  trigger: ShopifySyncTrigger;
  observedAt: Date;
}) {
  return {
    storeId,
    productId,
    shopifyLocationId,
    shopifyInventoryItemGid: level.shopifyInventoryItemGid,
    shopifyInventoryLevelGid: level.shopifyInventoryLevelGid,
    shopifyInventoryItemTracked: level.shopifyInventoryItemTracked,
    inventoryLevelActive: level.inventoryLevelActive,
    onHand: level.onHand,
    lastSyncedAt: observedAt,
    lastSyncTrigger: trigger,
  };
}

async function createMovement({
  tx,
  storeId,
  product,
  shopifyLocationId,
  shopifyLocationName,
  shopifyLocationGid,
  shopifyInventoryItemGid,
  shopifyInventoryLevelGid,
  previousOnHand,
  newOnHand,
  trigger,
  syncRunId,
  observedAt,
}: {
  tx: Prisma.TransactionClient;
  storeId: string;
  product: LocalProduct;
  shopifyLocationId: string | null;
  shopifyLocationName: string;
  shopifyLocationGid: string;
  shopifyInventoryItemGid: string | null;
  shopifyInventoryLevelGid: string | null;
  previousOnHand: number | null;
  newOnHand: number;
  trigger: ShopifySyncTrigger;
  syncRunId: string;
  observedAt: Date;
}) {
  await tx.shopifyInventoryMovement.create({
    data: {
      storeId,
      productId: product.id,
      shopifyLocationId,
      productName: product.name,
      sku: product.sku,
      shopifyLocationName,
      shopifyLocationGid,
      shopifyInventoryItemGid,
      shopifyInventoryLevelGid,
      previousOnHand,
      newOnHand,
      delta: newOnHand - (previousOnHand ?? 0),
      trigger,
      syncRunId,
      observedAt,
    },
  });
}

async function syncInventoryMirrorForProduct({
  tx,
  storeId,
  product,
  inventory,
  trigger,
  syncRunId,
  observedAt,
  syncedLocationGids,
}: {
  tx: Prisma.TransactionClient;
  storeId: string;
  product: LocalProduct;
  inventory: ShopifyInventoryForSku;
  trigger: ShopifySyncTrigger;
  syncRunId: string;
  observedAt: Date;
  syncedLocationGids: Set<string>;
}) {
  let syncedInventoryCount = 0;
  let movementCount = 0;
  const locationRowsByGid = new Map<string, { id: string; name: string; shopifyLocationGid: string }>();

  for (const level of inventory.levels) {
    const row = await tx.shopifyLocation.upsert({
      where: {
        storeId_shopifyLocationGid: {
          storeId,
          shopifyLocationGid: level.location.shopifyLocationGid,
        },
      },
      create: {
        storeId,
        ...locationData(level, observedAt),
      },
      update: locationData(level, observedAt),
      select: {
        id: true,
        name: true,
        shopifyLocationGid: true,
      },
    });
    locationRowsByGid.set(row.shopifyLocationGid, row);
    syncedLocationGids.add(row.shopifyLocationGid);
  }

  const seenLocationIds = new Set<string>();

  for (const level of inventory.levels) {
    const location = locationRowsByGid.get(level.location.shopifyLocationGid);
    if (!location) continue;
    seenLocationIds.add(location.id);

    const existing = await tx.shopifyInventoryCount.findUnique({
      where: {
        productId_shopifyLocationId: {
          productId: product.id,
          shopifyLocationId: location.id,
        },
      },
      select: {
        id: true,
        onHand: true,
      },
    });

    if (!existing) {
      await tx.shopifyInventoryCount.create({
        data: countData({
          storeId,
          productId: product.id,
          shopifyLocationId: location.id,
          level,
          trigger,
          observedAt,
        }),
      });
      await createMovement({
        tx,
        storeId,
        product,
        shopifyLocationId: location.id,
        shopifyLocationName: location.name,
        shopifyLocationGid: location.shopifyLocationGid,
        shopifyInventoryItemGid: level.shopifyInventoryItemGid,
        shopifyInventoryLevelGid: level.shopifyInventoryLevelGid,
        previousOnHand: null,
        newOnHand: level.onHand,
        trigger,
        syncRunId,
        observedAt,
      });
      syncedInventoryCount += 1;
      movementCount += 1;
      continue;
    }

    await tx.shopifyInventoryCount.update({
      where: { id: existing.id },
      data: countData({
        storeId,
        productId: product.id,
        shopifyLocationId: location.id,
        level,
        trigger,
        observedAt,
      }),
    });
    syncedInventoryCount += 1;

    if (existing.onHand !== level.onHand) {
      await createMovement({
        tx,
        storeId,
        product,
        shopifyLocationId: location.id,
        shopifyLocationName: location.name,
        shopifyLocationGid: location.shopifyLocationGid,
        shopifyInventoryItemGid: level.shopifyInventoryItemGid,
        shopifyInventoryLevelGid: level.shopifyInventoryLevelGid,
        previousOnHand: existing.onHand,
        newOnHand: level.onHand,
        trigger,
        syncRunId,
        observedAt,
      });
      movementCount += 1;
    }
  }

  const disappearedCounts = await tx.shopifyInventoryCount.findMany({
    where: {
      storeId,
      productId: product.id,
      ...(seenLocationIds.size > 0
        ? { shopifyLocationId: { notIn: [...seenLocationIds] } }
        : {}),
    },
    select: {
      id: true,
      onHand: true,
      shopifyInventoryItemGid: true,
      shopifyInventoryLevelGid: true,
      shopifyLocationId: true,
      shopifyLocation: {
        select: {
          name: true,
          shopifyLocationGid: true,
        },
      },
    },
  });

  for (const count of disappearedCounts) {
    await tx.shopifyInventoryCount.update({
      where: { id: count.id },
      data: {
        shopifyInventoryItemGid: null,
        shopifyInventoryLevelGid: null,
        shopifyInventoryItemTracked: null,
        inventoryLevelActive: false,
        onHand: 0,
        lastSyncedAt: observedAt,
        lastSyncTrigger: trigger,
      },
    });
    syncedInventoryCount += 1;

    if (count.onHand !== 0) {
      await createMovement({
        tx,
        storeId,
        product,
        shopifyLocationId: count.shopifyLocationId,
        shopifyLocationName: count.shopifyLocation.name,
        shopifyLocationGid: count.shopifyLocation.shopifyLocationGid,
        shopifyInventoryItemGid: count.shopifyInventoryItemGid,
        shopifyInventoryLevelGid: count.shopifyInventoryLevelGid,
        previousOnHand: count.onHand,
        newOnHand: 0,
        trigger,
        syncRunId,
        observedAt,
      });
      movementCount += 1;
    }
  }

  return { syncedInventoryCount, movementCount };
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
      ...emptySyncResult(integrationId),
      reason: "Shopify integration was not found",
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
      ...emptySyncResult(integrationId),
      reason: lockReason(lock.lockUntil),
      lockExpiresAt: lock.lockUntil?.toISOString() ?? null,
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
        ...emptySyncResult(integrationId),
        reason: "Shopify integration was not found",
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
        ...emptySyncResult(integrationId),
        reason: "Shopify integration is disabled",
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
      select: { id: true, name: true, sku: true },
      orderBy: { sku: "asc" },
    });

    const productsBySku = new Map<string, LocalProduct[]>();
    for (const product of products) {
      const sku = product.sku.trim();
      if (!sku) continue;
      const rows = productsBySku.get(sku) ?? [];
      rows.push(product);
      productsBySku.set(sku, rows);
    }

    const skuCount = productsBySku.size;
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
    let syncedInventoryCount = 0;
    let movementCount = 0;
    const syncRunId = randomUUID();
    const observedAt = new Date();
    const syncedLocationGids = new Set<string>();

    for (const sku of productsBySku.keys()) {
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
        const productRows = productsBySku.get(sku) ?? [];
        syncedProductCount += productRows.length;

        const stats = await prisma.$transaction(async (tx) => {
          let transactionSyncedInventoryCount = 0;
          let transactionMovementCount = 0;

          for (const product of productRows) {
            await tx.product.updateMany({
              where: { id: product.id, storeId: integration.storeId },
              data: { stockCount: inventory.quantity },
            });
            const mirrorStats = await syncInventoryMirrorForProduct({
              tx,
              storeId: integration.storeId,
              product,
              inventory,
              trigger,
              syncRunId,
              observedAt,
              syncedLocationGids,
            });
            transactionSyncedInventoryCount += mirrorStats.syncedInventoryCount;
            transactionMovementCount += mirrorStats.movementCount;
          }

          return {
            syncedInventoryCount: transactionSyncedInventoryCount,
            movementCount: transactionMovementCount,
          };
        });
        syncedInventoryCount += stats.syncedInventoryCount;
        movementCount += stats.movementCount;
      }

      if (shouldLogProgress) {
        console.info("[shopify-sync] sku progress", {
          integrationId,
          trigger,
          checkedSkuCount,
          skuCount,
          matchedSkuCount,
          syncedProductCount,
          syncedLocationCount: syncedLocationGids.size,
          syncedInventoryCount,
          movementCount,
        });
      }
    }

    const result = {
      integrationId,
      skipped: false,
      syncedProductCount,
      matchedSkuCount,
      unmatchedLocalSkuCount: productsBySku.size - matchedSkuCount,
      syncedLocationCount: syncedLocationGids.size,
      syncedInventoryCount,
      movementCount,
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
      syncedLocationCount: result.syncedLocationCount,
      syncedInventoryCount: result.syncedInventoryCount,
      movementCount: result.movementCount,
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
      ...emptySyncResult(""),
      reason: "Shopify integration is not configured",
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
