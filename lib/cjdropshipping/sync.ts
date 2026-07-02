import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CjDropshippingApiError,
  CjDropshippingClient,
  type CjPrivateInventoryOrderRow,
  type CjPrivateInventorySkuListData,
  type CjPrivateInventorySkuRow,
  type CjPrivateInventoryStore,
  normalizeCjSku,
  toInt,
} from "@/lib/cjdropshipping/api";
import { ensureCjAccessToken } from "@/lib/cjdropshipping/auth";

const SYNC_LOCK_MS = 10 * 60 * 1000;
const PRIVATE_INVENTORY_PAGE_SIZE = 100;
const PRIVATE_INVENTORY_MAX_PAGES = 1000;
const PRIVATE_INVENTORY_FALLBACK_AREA_ID = "private-inventory";

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
  cjAreaId: string | null;
  cjAreaEn: string | null;
  countryCode: string | null;
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

function isCjProductNotFoundError(error: unknown) {
  return (
    error instanceof CjDropshippingApiError &&
    error.message.trim().toLowerCase() === "product not found"
  );
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

function variantLabelFromPrivateInventorySku(row: CjPrivateInventorySkuRow) {
  const rawVariantKey = stringOrNull(row.variantKey);
  if (rawVariantKey) {
    try {
      const parsed = JSON.parse(rawVariantKey) as unknown;
      if (Array.isArray(parsed)) {
        const labels = parsed
          .map((item) => stringOrNull(item))
          .filter((item): item is string => Boolean(item));
        if (labels.length > 0) return labels.join(" - ");
      }
    } catch {
      return rawVariantKey;
    }
    return rawVariantKey;
  }

  return [
    stringOrNull(row.variantValue1),
    stringOrNull(row.variantValue2),
    stringOrNull(row.variantValue3),
  ]
    .filter((item): item is string => Boolean(item))
    .join(" - ") || null;
}

function metadataFromPrivateInventorySku(
  row: CjPrivateInventorySkuRow,
): CjSkuMetadata | null {
  const sku = normalizeCjSku(row.sku);
  if (!sku) return null;

  const productName = stringOrNull(row.productName);
  const variantLabel = variantLabelFromPrivateInventorySku(row);
  const cjProductName =
    productName && variantLabel
      ? `${productName} - ${variantLabel}`
      : productName ?? variantLabel;

  return {
    sku,
    cjProductId: stringOrNull(row.productId),
    cjVariantId: stringOrNull(row.variantId),
    cjProductName,
    cjAreaId: stringOrNull(row.storageId),
    cjAreaEn: null,
    countryCode: null,
  };
}

function privateInventoryPageSignature(rows: CjPrivateInventorySkuRow[]) {
  return rows
    .map((product) =>
      [
        stringOrNull(product.productId) ?? "",
        normalizeCjSku(product.sku),
        stringOrNull(product.variantId) ?? "",
      ].join(":"),
    )
    .join("|");
}

async function collectCjPrivateInventorySkus(
  client: CjDropshippingClient,
  accessToken: string,
) {
  const bySku = new Map<
    string,
    { metadata: CjSkuMetadata; summary: CjPrivateInventorySkuRow }
  >();
  const seenPageSignatures = new Set<string>();

  for (let pageNumber = 1; pageNumber <= PRIVATE_INVENTORY_MAX_PAGES; pageNumber += 1) {
    let data: CjPrivateInventorySkuListData;
    try {
      data = await client.getPrivateInventoryDocumentSkus({
        accessToken,
        pageNum: pageNumber,
        pageSize: PRIVATE_INVENTORY_PAGE_SIZE,
      });
    } catch (error) {
      if (isCjProductNotFoundError(error)) {
        console.info("[cjdropshipping-sync] no CJ private inventory found", {
          pageNumber,
        });
        break;
      }
      throw error;
    }
    const content = Array.isArray(data.content) ? data.content : [];
    const signature = privateInventoryPageSignature(content);

    if (signature && seenPageSignatures.has(signature)) {
      console.warn(
        "[cjdropshipping-sync] repeated private inventory page detected; stopping",
        { pageNumber },
      );
      break;
    }
    if (signature) seenPageSignatures.add(signature);

    for (const row of content) {
      const metadata = metadataFromPrivateInventorySku(row);
      if (!metadata) continue;
      bySku.set(metadata.sku, { metadata, summary: row });
    }

    const totalRecords = toInt(data.totalRecords, 0);
    if (totalRecords > 0 && pageNumber * PRIVATE_INVENTORY_PAGE_SIZE >= totalRecords) break;
    if (content.length === 0 || content.length < PRIVATE_INVENTORY_PAGE_SIZE) break;
  }

  return bySku;
}

async function collectCjPrivateInventoryStores(
  client: CjDropshippingClient,
  accessToken: string,
) {
  const byStorageId = new Map<string, CjPrivateInventoryStore>();
  try {
    const rows = await client.getPrivateInventoryStores({ accessToken });
    for (const row of Array.isArray(rows) ? rows : []) {
      const storageId = stringOrNull(row.storageId);
      if (storageId && !byStorageId.has(storageId)) byStorageId.set(storageId, row);
    }
  } catch (error) {
    console.warn("[cjdropshipping-sync] could not load CJ private inventory warehouses", {
      error: errorMessage(error),
    });
  }
  return byStorageId;
}

async function queryPrivateInventoryOrderRowsForSku(input: {
  client: CjDropshippingClient;
  accessToken: string;
  sku: string;
}) {
  try {
    const rows = await input.client.getPrivateInventoryDocumentOrders({
      accessToken: input.accessToken,
      sku: input.sku,
    });
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isCjProductNotFoundError(error)) {
      console.info("[cjdropshipping-sync] SKU not found in CJ private inventory orders", {
        sku: input.sku,
      });
      return [];
    }
    throw error;
  }
}

function countryCodeFromWarehouseName(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/\u00a0/g, " ");
  const maybeCountryCode = normalized.split(",").at(-1)?.trim().toUpperCase();
  return maybeCountryCode && /^[A-Z]{2}$/.test(maybeCountryCode)
    ? maybeCountryCode
    : null;
}

function privateInventoryQuantities(
  row: CjPrivateInventorySkuRow | CjPrivateInventoryOrderRow,
) {
  return {
    orderQuantity: toInt("orderQuantity" in row ? row.orderQuantity : null),
    transitQuantity: toInt(row.clientTransitQuantity),
    availableQuantity: toInt(row.clientAvailableQuantity),
    abnormalQuantity: toInt(row.clientFreezeQuantity),
    occupiedQuantity: toInt(row.clientLockQuantity),
    usedQuantity: toInt(row.clientUseQuantity),
    disputeQuantity: toInt(row.clientDisputeQuantity),
    disputedQuantity: toInt(row.clientDisputeCompleteQuantity),
  };
}

type PrivateInventoryQuantities = ReturnType<typeof privateInventoryQuantities>;

function emptyPrivateInventoryQuantities(): PrivateInventoryQuantities {
  return {
    orderQuantity: 0,
    transitQuantity: 0,
    availableQuantity: 0,
    abnormalQuantity: 0,
    occupiedQuantity: 0,
    usedQuantity: 0,
    disputeQuantity: 0,
    disputedQuantity: 0,
  };
}

function addPrivateInventoryQuantities(
  total: PrivateInventoryQuantities,
  next: PrivateInventoryQuantities,
) {
  total.orderQuantity += next.orderQuantity;
  total.transitQuantity += next.transitQuantity;
  total.availableQuantity += next.availableQuantity;
  total.abnormalQuantity += next.abnormalQuantity;
  total.occupiedQuantity += next.occupiedQuantity;
  total.usedQuantity += next.usedQuantity;
  total.disputeQuantity += next.disputeQuantity;
  total.disputedQuantity += next.disputedQuantity;
  return total;
}

function privateInventoryStockJson(input: {
  totals: PrivateInventoryQuantities;
  orders: CjPrivateInventoryOrderRow[];
}) {
  return {
    source: "privateInventoryDocuments",
    quantity: input.totals.orderQuantity,
    enroute: input.totals.transitQuantity,
    available: input.totals.availableQuantity,
    abnormal: input.totals.abnormalQuantity,
    occupied: input.totals.occupiedQuantity,
    used: input.totals.usedQuantity,
    dispute: input.totals.disputeQuantity,
    disputed: input.totals.disputedQuantity,
    orders: input.orders.map((row) => ({
      orderCode: stringOrNull(row.orderCode),
      storageId: stringOrNull(row.storageId),
      storage: stringOrNull(row.storage),
      unitPrice: toInt(row.unitPrice),
      quantity: toInt(row.orderQuantity),
      enroute: toInt(row.clientTransitQuantity),
      available: toInt(row.clientAvailableQuantity),
      abnormal: toInt(row.clientFreezeQuantity),
      occupied: toInt(row.clientLockQuantity),
      used: toInt(row.clientUseQuantity),
      dispute: toInt(row.clientDisputeQuantity),
      disputed: toInt(row.clientDisputeCompleteQuantity),
    })),
  };
}

function normalizePrivateInventoryRows(input: {
  sku: string;
  product: LocalProduct | null;
  metadata: CjSkuMetadata;
  summary: CjPrivateInventorySkuRow;
  orderRows: CjPrivateInventoryOrderRow[];
  warehousesByStorageId: Map<string, CjPrivateInventoryStore>;
}): NormalizedInventoryRow[] {
  const groupedOrders = new Map<
    string,
    {
      storageId: string | null;
      storageName: string | null;
      orders: CjPrivateInventoryOrderRow[];
      totals: PrivateInventoryQuantities;
    }
  >();

  for (const row of input.orderRows) {
    const rowSku = normalizeCjSku(row.sku);
    if (rowSku && rowSku !== input.sku) continue;

    const storageId = stringOrNull(row.storageId);
    const storageName = stringOrNull(row.storage);
    const key = storageId ?? storageName ?? PRIVATE_INVENTORY_FALLBACK_AREA_ID;
    const group =
      groupedOrders.get(key) ??
      {
        storageId,
        storageName,
        orders: [],
        totals: emptyPrivateInventoryQuantities(),
      };

    group.orders.push(row);
    addPrivateInventoryQuantities(group.totals, privateInventoryQuantities(row));
    groupedOrders.set(key, group);
  }

  if (groupedOrders.size === 0) {
    const totals = privateInventoryQuantities(input.summary);
    groupedOrders.set(
      stringOrNull(input.summary.storageId) ??
        input.metadata.cjAreaId ??
        PRIVATE_INVENTORY_FALLBACK_AREA_ID,
      {
        storageId: stringOrNull(input.summary.storageId) ?? input.metadata.cjAreaId,
        storageName: null,
        orders: [],
        totals,
      },
    );
  }

  const summaryTotals = privateInventoryQuantities(input.summary);

  return [...groupedOrders.values()].map((group) => {
    const warehouse = group.storageId
      ? input.warehousesByStorageId.get(group.storageId)
      : null;
    const cjAreaId =
      group.storageId ?? input.metadata.cjAreaId ?? PRIVATE_INVENTORY_FALLBACK_AREA_ID;
    const cjAreaEn =
      group.storageName ??
      stringOrNull(warehouse?.storehouseName) ??
      input.metadata.cjAreaEn ??
      "CJ Private Inventory";
    const countryCode =
      stringOrNull(warehouse?.countryCode) ??
      countryCodeFromWarehouseName(group.storageName) ??
      input.metadata.countryCode;
    const totals =
      groupedOrders.size === 1
        ? {
            ...summaryTotals,
            orderQuantity:
              group.totals.orderQuantity > 0
                ? group.totals.orderQuantity
                : summaryTotals.orderQuantity,
          }
        : group.totals;

    return {
      sku: input.sku,
      productId: input.product?.id ?? null,
      productName: input.product?.name ?? null,
      cjProductId: input.metadata.cjProductId,
      cjVariantId: input.metadata.cjVariantId,
      cjProductName: input.metadata.cjProductName,
      cjAreaId,
      cjAreaEn,
      countryCode,
      countryNameEn: null,
      // Use CJ's "Available" value as the sellable stock count. The same raw
      // payload keeps occupied/used/enroute values for audit/debugging.
      totalInventoryNum: totals.availableQuantity,
      cjInventoryNum: totals.availableQuantity,
      factoryInventoryNum: 0,
      stock: privateInventoryStockJson({
        totals,
        orders: group.orders,
      }) as Prisma.InputJsonValue,
    };
  });
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
  rows: NormalizedInventoryRow[];
  trigger: CjDropshippingSyncTrigger;
  syncRunId: string;
  observedAt: Date;
}) {
  let syncedInventoryCount = 0;
  let movementCount = 0;
  let hadExistingCounts = false;
  const seenAreaIds = new Set<string>();
  const normalizedRows = input.rows;

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

    await input.tx.cjDropshippingInventoryCount.delete({
      where: { id: count.id },
    });
    syncedInventoryCount += 1;
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
    const cjInventoryBySku = await collectCjPrivateInventorySkus(client, accessToken);
    const warehousesByStorageId = await collectCjPrivateInventoryStores(
      client,
      accessToken,
    );

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

    const previouslyMirroredSkus =
      await prisma.cjDropshippingInventoryCount.findMany({
        where: { storeId: integration.storeId },
        select: { sku: true },
        distinct: ["sku"],
        orderBy: { sku: "asc" },
      });
    const allSkus = [
      ...new Set([
        ...cjInventoryBySku.keys(),
        ...previouslyMirroredSkus.map((row) => row.sku),
      ]),
    ].sort();
    const syncRunId = randomUUID();
    const observedAt = new Date();
    const localSkusWithInventory = new Set<string>();
    const allCjSkus = new Set(cjInventoryBySku.keys());

    let syncedProductCount = 0;
    let syncedInventoryCount = 0;
    let movementCount = 0;

    for (const [index, sku] of allSkus.entries()) {
      const product = productsBySku.get(sku) ?? null;
      const cjInventory = cjInventoryBySku.get(sku) ?? null;
      const metadata = cjInventory?.metadata ?? null;
      const orderRows = cjInventory
        ? await queryPrivateInventoryOrderRowsForSku({ client, accessToken, sku })
        : [];
      const rows = cjInventory
        ? normalizePrivateInventoryRows({
            sku,
            product,
            metadata: cjInventory.metadata,
            summary: cjInventory.summary,
            orderRows,
            warehousesByStorageId,
          })
        : [];
      const hasCjInventoryRow = rows.length > 0;

      if (hasCjInventoryRow && product) localSkusWithInventory.add(sku);

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

        if (product && (hasCjInventoryRow || mirrorStats.hadExistingCounts)) {
          await tx.product.updateMany({
            where: { id: product.id, storeId: integration.storeId },
            data: { stockCount: mirrorStats.totalInventoryNum },
          });
        }

        return mirrorStats;
      });

      if (product && (hasCjInventoryRow || stats.hadExistingCounts)) syncedProductCount += 1;
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
          matchedSkuCount: localSkusWithInventory.size,
          syncedProductCount,
          syncedInventoryCount,
          movementCount,
        });
      }
    }

    const matchedSkuCount = localSkusWithInventory.size;
    const result: CjDropshippingSyncResult = {
      integrationId,
      skipped: false,
      syncedSkuCount: allCjSkus.size,
      matchedSkuCount,
      unmatchedCjSkuCount: [...allCjSkus].filter((sku) => !productsBySku.has(sku)).length,
      unmatchedLocalSkuCount: [...productsBySku.keys()].filter(
        (sku) => !localSkusWithInventory.has(sku),
      ).length,
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
