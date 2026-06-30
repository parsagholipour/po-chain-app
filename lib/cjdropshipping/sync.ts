import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CjDropshippingClient,
  type CjInventoryBySkuRow,
  type CjMyProduct,
  normalizeCjSku,
  toInt,
} from "@/lib/cjdropshipping/api";
import { ensureCjAccessToken } from "@/lib/cjdropshipping/auth";

const SYNC_LOCK_MS = 10 * 60 * 1000;
const MY_PRODUCTS_PAGE_SIZE = 100;
const MY_PRODUCTS_MAX_PAGES = 1000;

export type CjDropshippingSyncTrigger = "scheduled" | "manual";

export type CjDropshippingSyncResult = {
  integrationId: string;
  skipped: boolean;
  reason?: string;
  lockExpiresAt?: string | null;
  syncedSkuCount: number;
  matchedSkuCount: number;
  unmatchedCjSkuCount: number;
  unmatchedLocalSkuCount: number;
  syncedProductCount: number;
  syncedInventoryCount: number;
  movementCount: number;
};

type LocalProduct = {
  id: string;
  name: string;
  sku: string;
};

type CjSkuMetadata = {
  sku: string;
  cjProductId: string | null;
  cjVariantId: string | null;
  cjProductName: string | null;
};

type NormalizedInventoryRow = {
  sku: string;
  productId: string | null;
  productName: string | null;
  cjProductId: string | null;
  cjVariantId: string | null;
  cjProductName: string | null;
  cjAreaId: string;
  cjAreaEn: string | null;
  countryCode: string | null;
  countryNameEn: string | null;
  totalInventoryNum: number;
  cjInventoryNum: number;
  factoryInventoryNum: number;
  stock: Prisma.InputJsonValue | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function elapsedMs(startedAt: number) {
  return Date.now() - startedAt;
}

function lockReason(lockUntil: Date | null) {
  return lockUntil
    ? `A CJdropshipping inventory sync is already running until ${lockUntil.toISOString()}`
    : "A CJdropshipping inventory sync is already running";
}

function emptySyncResult(
  integrationId: string,
  overrides: Partial<CjDropshippingSyncResult> = {},
): CjDropshippingSyncResult {
  return {
    integrationId,
    skipped: true,
    syncedSkuCount: 0,
    matchedSkuCount: 0,
    unmatchedCjSkuCount: 0,
    unmatchedLocalSkuCount: 0,
    syncedProductCount: 0,
    syncedInventoryCount: 0,
    movementCount: 0,
    ...overrides,
  };
}

function stringOrNull(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function metadataFromMyProduct(product: CjMyProduct): CjSkuMetadata | null {
  const sku = normalizeCjSku(product.sku);
  if (!sku) return null;
  return {
    sku,
    cjProductId: stringOrNull(product.productId),
    cjVariantId: stringOrNull(product.vid),
    cjProductName: stringOrNull(product.nameEn),
  };
}

function pageSignature(products: CjMyProduct[]) {
  return products
    .map((product) =>
      [
        stringOrNull(product.productId) ?? "",
        normalizeCjSku(product.sku),
        stringOrNull(product.vid) ?? "",
      ].join(":"),
    )
    .join("|");
}

async function collectCjMyProductSkus(
  client: CjDropshippingClient,
  accessToken: string,
) {
  const bySku = new Map<string, CjSkuMetadata>();
  const seenPageSignatures = new Set<string>();

  for (let pageNumber = 1; pageNumber <= MY_PRODUCTS_MAX_PAGES; pageNumber += 1) {
    const data = await client.getMyProducts({
      accessToken,
      pageNumber,
      pageSize: MY_PRODUCTS_PAGE_SIZE,
    });
    const content = Array.isArray(data.content) ? data.content : [];
    const signature = pageSignature(content);

    if (signature && seenPageSignatures.has(signature)) {
      console.warn("[cjdropshipping-sync] repeated My Product page detected; stopping", {
        pageNumber,
      });
      break;
    }
    if (signature) seenPageSignatures.add(signature);

    for (const product of content) {
      const metadata = metadataFromMyProduct(product);
      if (!metadata || bySku.has(metadata.sku)) continue;
      bySku.set(metadata.sku, metadata);
    }

    const totalPages = toInt(data.totalPages, 0);
    if (totalPages > 0 && pageNumber >= totalPages) break;
    if (content.length === 0 || (totalPages === 0 && content.length < MY_PRODUCTS_PAGE_SIZE)) {
      break;
    }
  }

  return bySku;
}

function normalizeInventoryRow(input: {
  sku: string;
  product: LocalProduct | null;
  metadata: CjSkuMetadata | null;
  row: CjInventoryBySkuRow;
}): NormalizedInventoryRow {
  const cjAreaId =
    stringOrNull(input.row.areaId) ??
    stringOrNull(input.row.countryCode) ??
    stringOrNull(input.row.areaEn) ??
    "unknown";

  return {
    sku: input.sku,
    productId: input.product?.id ?? null,
    productName: input.product?.name ?? null,
    cjProductId: input.metadata?.cjProductId ?? null,
    cjVariantId: input.metadata?.cjVariantId ?? null,
    cjProductName: input.metadata?.cjProductName ?? null,
    cjAreaId,
    cjAreaEn: stringOrNull(input.row.areaEn),
    countryCode: stringOrNull(input.row.countryCode),
    countryNameEn: stringOrNull(input.row.countryNameEn),
    totalInventoryNum: toInt(input.row.totalInventoryNum),
    cjInventoryNum: toInt(input.row.cjInventoryNum),
    factoryInventoryNum: toInt(input.row.factoryInventoryNum),
    stock: Array.isArray(input.row.stock)
      ? (input.row.stock as Prisma.InputJsonValue)
      : null,
  };
}

function countData(
  row: NormalizedInventoryRow,
  trigger: CjDropshippingSyncTrigger,
  syncRunId: string,
  observedAt: Date,
) {
  return {
    productId: row.productId,
    cjProductId: row.cjProductId,
    cjVariantId: row.cjVariantId,
    cjProductName: row.cjProductName,
    cjAreaEn: row.cjAreaEn,
    countryCode: row.countryCode,
    countryNameEn: row.countryNameEn,
    totalInventoryNum: row.totalInventoryNum,
    cjInventoryNum: row.cjInventoryNum,
    factoryInventoryNum: row.factoryInventoryNum,
    stock: row.stock ?? Prisma.DbNull,
    lastSyncedAt: observedAt,
    lastSyncTrigger: trigger,
    lastSeenInRunId: syncRunId,
  };
}

async function createTransaction(input: {
  tx: Prisma.TransactionClient;
  storeId: string;
  row: NormalizedInventoryRow;
  previousTotalInventoryNum: number | null;
  previousCjInventoryNum: number | null;
  previousFactoryInventoryNum: number | null;
  trigger: CjDropshippingSyncTrigger;
  syncRunId: string;
  observedAt: Date;
}) {
  const delta = input.row.totalInventoryNum - (input.previousTotalInventoryNum ?? 0);
  const movementType =
    input.previousTotalInventoryNum == null
      ? "initial"
      : delta >= 0
        ? "increase"
        : "decrease";

  await input.tx.cjDropshippingInventoryTransaction.create({
    data: {
      storeId: input.storeId,
      productId: input.row.productId,
      productName: input.row.productName,
      sku: input.row.sku,
      cjProductId: input.row.cjProductId,
      cjVariantId: input.row.cjVariantId,
      cjProductName: input.row.cjProductName,
      cjAreaId: input.row.cjAreaId,
      cjAreaEn: input.row.cjAreaEn,
      countryCode: input.row.countryCode,
      countryNameEn: input.row.countryNameEn,
      previousTotalInventoryNum: input.previousTotalInventoryNum,
      newTotalInventoryNum: input.row.totalInventoryNum,
      previousCjInventoryNum: input.previousCjInventoryNum,
      newCjInventoryNum: input.row.cjInventoryNum,
      previousFactoryInventoryNum: input.previousFactoryInventoryNum,
      newFactoryInventoryNum: input.row.factoryInventoryNum,
      delta,
      movementType,
      trigger: input.trigger,
      syncRunId: input.syncRunId,
      observedAt: input.observedAt,
    },
  });
}

async function syncInventoryMirrorForSku(input: {
  tx: Prisma.TransactionClient;
  storeId: string;
  sku: string;
  product: LocalProduct | null;
  metadata: CjSkuMetadata | null;
  rows: CjInventoryBySkuRow[];
  trigger: CjDropshippingSyncTrigger;
  syncRunId: string;
  observedAt: Date;
}) {
  let syncedInventoryCount = 0;
  let movementCount = 0;
  let hadExistingCounts = false;
  const seenAreaIds = new Set<string>();
  const normalizedRows = input.rows.map((row) =>
    normalizeInventoryRow({
      sku: input.sku,
      product: input.product,
      metadata: input.metadata,
      row,
    }),
  );

  for (const row of normalizedRows) {
    seenAreaIds.add(row.cjAreaId);
    const existing = await input.tx.cjDropshippingInventoryCount.findUnique({
      where: {
        storeId_sku_cjAreaId: {
          storeId: input.storeId,
          sku: input.sku,
          cjAreaId: row.cjAreaId,
        },
      },
      select: {
        id: true,
        totalInventoryNum: true,
        cjInventoryNum: true,
        factoryInventoryNum: true,
      },
    });

    if (!existing) {
      await input.tx.cjDropshippingInventoryCount.create({
        data: {
          storeId: input.storeId,
          sku: input.sku,
          cjAreaId: row.cjAreaId,
          ...countData(row, input.trigger, input.syncRunId, input.observedAt),
        },
      });
      await createTransaction({
        tx: input.tx,
        storeId: input.storeId,
        row,
        previousTotalInventoryNum: null,
        previousCjInventoryNum: null,
        previousFactoryInventoryNum: null,
        trigger: input.trigger,
        syncRunId: input.syncRunId,
        observedAt: input.observedAt,
      });
      syncedInventoryCount += 1;
      movementCount += 1;
      continue;
    }

    hadExistingCounts = true;
    await input.tx.cjDropshippingInventoryCount.update({
      where: { id: existing.id },
      data: countData(row, input.trigger, input.syncRunId, input.observedAt),
    });
    syncedInventoryCount += 1;

    if (existing.totalInventoryNum !== row.totalInventoryNum) {
      await createTransaction({
        tx: input.tx,
        storeId: input.storeId,
        row,
        previousTotalInventoryNum: existing.totalInventoryNum,
        previousCjInventoryNum: existing.cjInventoryNum,
        previousFactoryInventoryNum: existing.factoryInventoryNum,
        trigger: input.trigger,
        syncRunId: input.syncRunId,
        observedAt: input.observedAt,
      });
      movementCount += 1;
    }
  }

  const disappearedCounts = await input.tx.cjDropshippingInventoryCount.findMany({
    where: {
      storeId: input.storeId,
      sku: input.sku,
      ...(seenAreaIds.size > 0 ? { cjAreaId: { notIn: [...seenAreaIds] } } : {}),
    },
    select: {
      id: true,
      productId: true,
      sku: true,
      cjProductId: true,
      cjVariantId: true,
      cjProductName: true,
      cjAreaId: true,
      cjAreaEn: true,
      countryCode: true,
      countryNameEn: true,
      totalInventoryNum: true,
      cjInventoryNum: true,
      factoryInventoryNum: true,
      product: { select: { name: true } },
    },
  });

  if (disappearedCounts.length > 0) hadExistingCounts = true;

  for (const count of disappearedCounts) {
    await input.tx.cjDropshippingInventoryCount.update({
      where: { id: count.id },
      data: {
        productId: input.product?.id ?? count.productId,
        cjProductId: input.metadata?.cjProductId ?? count.cjProductId,
        cjVariantId: input.metadata?.cjVariantId ?? count.cjVariantId,
        cjProductName: input.metadata?.cjProductName ?? count.cjProductName,
        totalInventoryNum: 0,
        cjInventoryNum: 0,
        factoryInventoryNum: 0,
        stock: Prisma.DbNull,
        lastSyncedAt: input.observedAt,
        lastSyncTrigger: input.trigger,
        lastSeenInRunId: input.syncRunId,
      },
    });
    syncedInventoryCount += 1;

    if (count.totalInventoryNum !== 0) {
      await createTransaction({
        tx: input.tx,
        storeId: input.storeId,
        row: {
          sku: count.sku,
          productId: input.product?.id ?? count.productId,
          productName: input.product?.name ?? count.product?.name ?? null,
          cjProductId: input.metadata?.cjProductId ?? count.cjProductId,
          cjVariantId: input.metadata?.cjVariantId ?? count.cjVariantId,
          cjProductName: input.metadata?.cjProductName ?? count.cjProductName,
          cjAreaId: count.cjAreaId,
          cjAreaEn: count.cjAreaEn,
          countryCode: count.countryCode,
          countryNameEn: count.countryNameEn,
          totalInventoryNum: 0,
          cjInventoryNum: 0,
          factoryInventoryNum: 0,
          stock: null,
        },
        previousTotalInventoryNum: count.totalInventoryNum,
        previousCjInventoryNum: count.cjInventoryNum,
        previousFactoryInventoryNum: count.factoryInventoryNum,
        trigger: input.trigger,
        syncRunId: input.syncRunId,
        observedAt: input.observedAt,
      });
      movementCount += 1;
    }
  }

  return {
    hadExistingCounts,
    syncedInventoryCount,
    movementCount,
    totalInventoryNum: normalizedRows.reduce(
      (sum, row) => sum + row.totalInventoryNum,
      0,
    ),
  };
}

async function acquireSyncLock(integrationId: string) {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + SYNC_LOCK_MS);
  const updated = await prisma.cjDropshippingIntegration.updateMany({
    where: {
      id: integrationId,
      OR: [{ syncLockUntil: null }, { syncLockUntil: { lt: now } }],
    },
    data: { syncLockUntil: lockUntil },
  });

  if (updated.count === 1) {
    return { status: "acquired" as const, lockUntil };
  }

  const current = await prisma.cjDropshippingIntegration.findUnique({
    where: { id: integrationId },
    select: {
      syncLockUntil: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      updatedAt: true,
    },
  });

  if (!current) return { status: "missing" as const };

  return {
    status: "locked" as const,
    lockUntil: current.syncLockUntil,
    lastSyncAt: current.lastSyncAt,
    lastSyncStatus: current.lastSyncStatus,
    updatedAt: current.updatedAt,
  };
}

async function markSyncError(integrationId: string, error: unknown) {
  await prisma.cjDropshippingIntegration.update({
    where: { id: integrationId },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: "error",
      lastSyncError: errorMessage(error).slice(0, 4000),
      syncLockUntil: null,
    },
  });
}

export async function syncCjDropshippingIntegrationById(
  integrationId: string,
  trigger: CjDropshippingSyncTrigger,
): Promise<CjDropshippingSyncResult> {
  const startedAt = Date.now();
  console.info("[cjdropshipping-sync] sync requested", { integrationId, trigger });

  const lock = await acquireSyncLock(integrationId);
  if (lock.status === "missing") {
    return {
      ...emptySyncResult(integrationId),
      reason: "CJdropshipping integration was not found",
    };
  }
  if (lock.status === "locked") {
    return {
      ...emptySyncResult(integrationId),
      reason: lockReason(lock.lockUntil),
      lockExpiresAt: lock.lockUntil?.toISOString() ?? null,
    };
  }

  try {
    const integration = await prisma.cjDropshippingIntegration.findUnique({
      where: { id: integrationId },
      select: {
        id: true,
        storeId: true,
        enabled: true,
        apiKeyEncrypted: true,
      },
    });

    if (!integration) {
      return {
        ...emptySyncResult(integrationId),
        reason: "CJdropshipping integration was not found",
      };
    }

    if (!integration.enabled) {
      await prisma.cjDropshippingIntegration.update({
        where: { id: integration.id },
        data: { syncLockUntil: null },
      });
      return {
        ...emptySyncResult(integrationId),
        reason: "CJdropshipping integration is disabled",
      };
    }

    if (!integration.apiKeyEncrypted) {
      throw new Error("CJdropshipping API key is not configured");
    }

    const client = new CjDropshippingClient();
    const accessToken = await ensureCjAccessToken(integration.id, client);
    const cjProductsBySku = await collectCjMyProductSkus(client, accessToken);

    const products = await prisma.product.findMany({
      where: { storeId: integration.storeId },
      select: { id: true, name: true, sku: true },
      orderBy: { sku: "asc" },
    });

    const productsBySku = new Map<string, LocalProduct>();
    for (const product of products) {
      const sku = product.sku.trim();
      if (!sku || productsBySku.has(sku)) continue;
      productsBySku.set(sku, product);
    }

    const allSkus = [...new Set([...cjProductsBySku.keys(), ...productsBySku.keys()])].sort();
    const syncRunId = randomUUID();
    const observedAt = new Date();
    const cjSkusWithInventory = new Set<string>();
    const localSkusWithInventory = new Set<string>();

    let syncedProductCount = 0;
    let syncedInventoryCount = 0;
    let movementCount = 0;

    for (const [index, sku] of allSkus.entries()) {
      const product = productsBySku.get(sku) ?? null;
      const metadata = cjProductsBySku.get(sku) ?? null;
      const inventoryRows = await client.queryInventoryBySku({ accessToken, sku });
      const rows = Array.isArray(inventoryRows) ? inventoryRows : [];
      const hasInventory = rows.length > 0;

      if (hasInventory && metadata) cjSkusWithInventory.add(sku);
      if (hasInventory && product) localSkusWithInventory.add(sku);

      const stats = await prisma.$transaction(async (tx) => {
        const mirrorStats = await syncInventoryMirrorForSku({
          tx,
          storeId: integration.storeId,
          sku,
          product,
          metadata,
          rows,
          trigger,
          syncRunId,
          observedAt,
        });

        if (product && (hasInventory || mirrorStats.hadExistingCounts)) {
          await tx.product.updateMany({
            where: { id: product.id, storeId: integration.storeId },
            data: { stockCount: mirrorStats.totalInventoryNum },
          });
        }

        return mirrorStats;
      });

      if (product && (hasInventory || stats.hadExistingCounts)) syncedProductCount += 1;
      syncedInventoryCount += stats.syncedInventoryCount;
      movementCount += stats.movementCount;

      const checkedSkuCount = index + 1;
      const shouldLogProgress =
        checkedSkuCount === 1 ||
        checkedSkuCount % 25 === 0 ||
        checkedSkuCount === allSkus.length;
      if (shouldLogProgress) {
        console.info("[cjdropshipping-sync] sku progress", {
          integrationId,
          trigger,
          checkedSkuCount,
          skuCount: allSkus.length,
          matchedSkuCount: new Set([
            ...cjSkusWithInventory,
            ...localSkusWithInventory,
          ]).size,
          syncedProductCount,
          syncedInventoryCount,
          movementCount,
        });
      }
    }

    const matchedSkuCount = new Set([
      ...cjSkusWithInventory,
      ...localSkusWithInventory,
    ]).size;
    const result: CjDropshippingSyncResult = {
      integrationId,
      skipped: false,
      syncedSkuCount: allSkus.length,
      matchedSkuCount,
      unmatchedCjSkuCount: cjProductsBySku.size - cjSkusWithInventory.size,
      unmatchedLocalSkuCount: productsBySku.size - localSkusWithInventory.size,
      syncedProductCount,
      syncedInventoryCount,
      movementCount,
    };

    await prisma.cjDropshippingIntegration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: trigger,
        lastSyncError: null,
        lastSyncedSkuCount: result.syncedSkuCount,
        lastMatchedSkuCount: result.matchedSkuCount,
        lastUnmatchedCjSkuCount: result.unmatchedCjSkuCount,
        lastUnmatchedLocalSkuCount: result.unmatchedLocalSkuCount,
        lastSyncedProductCount: result.syncedProductCount,
        lastSyncedInventoryCount: result.syncedInventoryCount,
        lastMovementCount: result.movementCount,
        syncLockUntil: null,
      },
    });

    console.info("[cjdropshipping-sync] sync completed", {
      storeId: integration.storeId,
      trigger,
      durationMs: elapsedMs(startedAt),
      ...result,
    });

    return result;
  } catch (error) {
    console.error("[cjdropshipping-sync] sync failed", {
      integrationId,
      trigger,
      durationMs: elapsedMs(startedAt),
      error: errorMessage(error),
    });
    await markSyncError(integrationId, error);
    throw error;
  }
}

export async function syncCjDropshippingIntegrationForStore(
  storeId: string,
  trigger: CjDropshippingSyncTrigger,
) {
  const integration = await prisma.cjDropshippingIntegration.findUnique({
    where: { storeId },
    select: { id: true },
  });
  if (!integration) {
    return {
      ...emptySyncResult(""),
      reason: "CJdropshipping integration is not configured",
    };
  }
  return syncCjDropshippingIntegrationById(integration.id, trigger);
}

export async function syncAllEnabledCjDropshippingIntegrations() {
  const rows = await prisma.cjDropshippingIntegration.findMany({
    where: {
      enabled: true,
      apiKeyEncrypted: { not: null },
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
  });

  const results: Array<
    CjDropshippingSyncResult | { integrationId: string; skipped: false; error: string }
  > = [];

  for (const row of rows) {
    try {
      results.push(await syncCjDropshippingIntegrationById(row.id, "scheduled"));
    } catch (error) {
      console.error("[cjdropshipping-sync] scheduled sync failed", row.id, error);
      results.push({
        integrationId: row.id,
        skipped: false,
        error: errorMessage(error),
      });
    }
  }

  return results;
}
