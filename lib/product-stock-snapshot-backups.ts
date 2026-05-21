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

function buildCsv(
  products: Array<{ sku: string; name: string; stockCount: number | null }>,
) {
  const rows: Array<Array<string | number | null>> = [
    ["SKU", "Product name", "Stock count"],
    ...products.map((product) => [
      product.sku,
      product.name,
      product.stockCount,
    ]),
  ];

  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
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

  const products = await prisma.product.findMany({
    where: { storeId },
    select: { sku: true, name: true, stockCount: true },
    orderBy: [{ sku: "asc" }, { name: "asc" }],
  });

  const dateKey = snapshotDateKey(now);
  const fileName = `product-stock-snapshot-${dateKey}.csv`;
  const objectKey = `${STOCK_SNAPSHOT_PREFIX}/${storeId}/${fileName}`;
  const body = Buffer.from(buildCsv(products), "utf8");

  await putObject({
    key: objectKey,
    body,
    contentType: STOCK_SNAPSHOT_CONTENT_TYPE,
    cacheControl: "no-store",
  });

  const backup = await prisma.productStockSnapshotBackup.create({
    data: {
      storeId,
      snapshotDate,
      objectKey,
      fileName,
      contentType: STOCK_SNAPSHOT_CONTENT_TYPE,
      size: body.byteLength,
      productCount: products.length,
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
