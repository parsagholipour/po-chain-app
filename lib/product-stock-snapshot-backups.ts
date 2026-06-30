import "server-only";

import { prisma } from "@/lib/prisma";
import { isObjectStorageConfigured, putObject } from "@/lib/storage";

const STOCK_SNAPSHOT_CONTENT_TYPE = "text/csv; charset=utf-8";
const STOCK_SNAPSHOT_PREFIX = "backups/product-stock";

type ProductStockSnapshotRow = {
  id: string;
  snapshotDate: Date;
  objectKey: string;
  fileName: string;
  contentType: string;
  size: number;
  productCount: number;
  createdAt: Date;
};

export type ProductStockSnapshotBackupItem = {
  id: string;
  snapshotDate: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  size: number;
  productCount: number;
  createdAt: string;
};

export type ProductStockSnapshotCreationResult = {
  backup: ProductStockSnapshotBackupItem;
  skipped: boolean;
  reason?: string;
};

type ProductStockSnapshotDailyResult =
  | (ProductStockSnapshotCreationResult & { storeId: string })
  | { storeId: string; skipped: true; reason: string; error: string };

type ProductStockSnapshotCsvRow = {
  sku: string;
  name: string;
  stockCount: number | null;
  source: "Local" | "CJdropshipping";
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function localDateParts(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function snapshotDateKey(date: Date) {
  const { year, month, day } = localDateParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function snapshotDateValue(date: Date) {
  const { year, month, day } = localDateParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function rowToItem(row: ProductStockSnapshotRow): ProductStockSnapshotBackupItem {
  return {
    id: row.id,
    snapshotDate: row.snapshotDate.toISOString().slice(0, 10),
    objectKey: row.objectKey,
    fileName: row.fileName,
    contentType: row.contentType,
    size: row.size,
    productCount: row.productCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function csvCell(value: string | number | null) {
  if (value == null) return "";
  const raw = String(value);
  if (!/[",\r\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function buildCsv(rowsForBackup: ProductStockSnapshotCsvRow[]) {
  const rows: Array<Array<string | number | null>> = [
    ["SKU", "Product name", "Stock count", "Source"],
    ...rowsForBackup.map((row) => [
      row.sku,
      row.name,
      row.stockCount,
      row.source,
    ]),
  ];

  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

async function getProductStockSnapshotRows(storeId: string) {
  const products = await prisma.product.findMany({
    where: { storeId },
    select: { sku: true, name: true, stockCount: true },
    orderBy: [{ sku: "asc" }, { name: "asc" }],
  });

  const localSkus = new Set(
    products.map((product) => product.sku.trim()).filter(Boolean),
  );
  const rowsForBackup: ProductStockSnapshotCsvRow[] = products.map((product) => ({
    sku: product.sku,
    name: product.name,
    stockCount: product.stockCount,
    source: "Local",
  }));

  const cjOnlyInventoryRows = await prisma.cjDropshippingInventoryCount.findMany({
    where: {
      storeId,
      productId: null,
    },
    select: {
      sku: true,
      cjProductName: true,
      totalInventoryNum: true,
    },
    orderBy: [{ sku: "asc" }, { cjAreaId: "asc" }],
  });

  const cjOnlyBySku = new Map<
    string,
    { sku: string; name: string; stockCount: number }
  >();
  for (const row of cjOnlyInventoryRows) {
    const sku = row.sku.trim();
    if (!sku || localSkus.has(sku)) continue;

    const existing = cjOnlyBySku.get(sku);
    if (existing) {
      existing.stockCount += row.totalInventoryNum;
      if (!existing.name && row.cjProductName) existing.name = row.cjProductName;
      continue;
    }

    cjOnlyBySku.set(sku, {
      sku,
      name: row.cjProductName?.trim() || `CJdropshipping ${sku}`,
      stockCount: row.totalInventoryNum,
    });
  }

  rowsForBackup.push(
    ...[...cjOnlyBySku.values()]
      .sort((a, b) => a.sku.localeCompare(b.sku) || a.name.localeCompare(b.name))
      .map((row) => ({
        ...row,
        source: "CJdropshipping" as const,
      })),
  );

  return rowsForBackup;
}

async function buildProductStockSnapshotPayload(storeId: string, now: Date) {
  const rowsForBackup = await getProductStockSnapshotRows(storeId);
  const dateKey = snapshotDateKey(now);
  const fileName = `product-stock-snapshot-${dateKey}.csv`;
  const objectKey = `${STOCK_SNAPSHOT_PREFIX}/${storeId}/${fileName}`;
  const body = Buffer.from(buildCsv(rowsForBackup), "utf8");

  return {
    snapshotDate: snapshotDateValue(now),
    fileName,
    objectKey,
    body,
    productCount: rowsForBackup.length,
  };
}

export async function listProductStockSnapshotBackups(storeId: string) {
  const rows = await prisma.productStockSnapshotBackup.findMany({
    where: { storeId },
    orderBy: [{ snapshotDate: "desc" }, { createdAt: "desc" }],
  });

  return rows.map(rowToItem);
}

export async function createProductStockSnapshotBackupForStore(
  storeId: string,
  now = new Date(),
): Promise<ProductStockSnapshotCreationResult> {
  const snapshotDate = snapshotDateValue(now);
  const existing = await prisma.productStockSnapshotBackup.findUnique({
    where: { storeId_snapshotDate: { storeId, snapshotDate } },
  });

  if (existing) {
    return {
      backup: rowToItem(existing),
      skipped: true,
      reason: "A product stock backup already exists for this date",
    };
  }

  const payload = await buildProductStockSnapshotPayload(storeId, now);

  await putObject({
    key: payload.objectKey,
    body: payload.body,
    contentType: STOCK_SNAPSHOT_CONTENT_TYPE,
    cacheControl: "no-store",
  });

  const backup = await prisma.productStockSnapshotBackup.create({
    data: {
      storeId,
      snapshotDate,
      objectKey: payload.objectKey,
      fileName: payload.fileName,
      contentType: STOCK_SNAPSHOT_CONTENT_TYPE,
      size: payload.body.byteLength,
      productCount: payload.productCount,
    },
  });

  return { backup: rowToItem(backup), skipped: false };
}

export async function refreshProductStockSnapshotBackupForStore(
  storeId: string,
  now = new Date(),
): Promise<ProductStockSnapshotCreationResult> {
  const payload = await buildProductStockSnapshotPayload(storeId, now);

  await putObject({
    key: payload.objectKey,
    body: payload.body,
    contentType: STOCK_SNAPSHOT_CONTENT_TYPE,
    cacheControl: "no-store",
  });

  const backup = await prisma.productStockSnapshotBackup.upsert({
    where: { storeId_snapshotDate: { storeId, snapshotDate: payload.snapshotDate } },
    create: {
      storeId,
      snapshotDate: payload.snapshotDate,
      objectKey: payload.objectKey,
      fileName: payload.fileName,
      contentType: STOCK_SNAPSHOT_CONTENT_TYPE,
      size: payload.body.byteLength,
      productCount: payload.productCount,
    },
    update: {
      objectKey: payload.objectKey,
      fileName: payload.fileName,
      contentType: STOCK_SNAPSHOT_CONTENT_TYPE,
      size: payload.body.byteLength,
      productCount: payload.productCount,
    },
  });

  return { backup: rowToItem(backup), skipped: false };
}

export async function createDailyProductStockSnapshots(now = new Date()) {
  if (!isObjectStorageConfigured()) {
    console.warn(
      "[product-stock-backup] object storage is not configured; daily snapshots skipped",
    );
    return [];
  }

  const stores = await prisma.store.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const results: ProductStockSnapshotDailyResult[] = [];

  for (const store of stores) {
    try {
      const result = await createProductStockSnapshotBackupForStore(store.id, now);
      results.push({ storeId: store.id, ...result });
    } catch (error) {
      const message = errorMessage(error);
      console.error(
        "[product-stock-backup] daily snapshot failed",
        store.id,
        error,
      );
      results.push({
        storeId: store.id,
        skipped: true,
        reason: message,
        error: message,
      });
    }
  }

  return results;
}
