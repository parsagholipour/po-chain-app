import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SNAPSHOT_CONTENT_TYPE = "text/csv; charset=utf-8";

export class InventorySnapshotDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventorySnapshotDateError";
  }
}

export type CjInventorySnapshotRow = {
  sku: string;
  cjInternalSku: string;
  localSku: string | null;
  productName: string | null;
  cjProductName: string | null;
  cjAreaId: string;
  cjAreaEn: string | null;
  countryCode: string | null;
  countryNameEn: string | null;
  newTotalInventoryNum: number;
  newCjInventoryNum: number;
  newFactoryInventoryNum: number;
  observedAt: Date;
};

export type CjInventorySnapshotCsv = {
  dateKey: string;
  fileName: string;
  contentType: string;
  body: string;
  rowCount: number;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(dateKey: string) {
  const match = DATE_KEY_RE.exec(dateKey);
  if (!match) {
    throw new InventorySnapshotDateError("Date must be YYYY-MM-DD");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const local = new Date(year, month - 1, day);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day
  ) {
    throw new InventorySnapshotDateError("Invalid date");
  }

  const todayKey = localDateKey(new Date());
  if (dateKey > todayKey) {
    throw new InventorySnapshotDateError("Date cannot be in the future");
  }

  return { year, month, day, dateKey };
}

function asOfExclusiveEnd(parts: { year: number; month: number; day: number }) {
  return new Date(parts.year, parts.month - 1, parts.day + 1);
}

function csvCell(value: string | number | null) {
  if (value == null) return "";
  const raw = String(value);
  if (!/[",\r\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function productName(row: CjInventorySnapshotRow) {
  return row.productName?.trim() || row.cjProductName?.trim() || "";
}

function warehouseLabel(row: CjInventorySnapshotRow) {
  return row.cjAreaEn?.trim() || row.countryNameEn?.trim() || row.cjAreaId;
}

function countryLabel(row: CjInventorySnapshotRow) {
  return [row.countryCode, row.countryNameEn].filter(Boolean).join(" / ");
}

function buildCsv(rows: CjInventorySnapshotRow[]) {
  const table: Array<Array<string | number | null>> = [
    [
      "SKU",
      "Local SKU",
      "Product name",
      "Warehouse",
      "Warehouse ID",
      "Country",
      "Total",
      "CJ",
      "Factory",
      "Last observed at",
    ],
    ...rows.map((row) => [
      row.sku,
      row.localSku,
      productName(row),
      warehouseLabel(row),
      row.cjAreaId,
      countryLabel(row),
      row.newTotalInventoryNum,
      row.newCjInventoryNum,
      row.newFactoryInventoryNum,
      row.observedAt.toISOString(),
    ]),
  ];

  return `${table.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export async function buildCjInventorySnapshotCsv(input: {
  storeId: string;
  dateKey: string;
  warehouseId?: string;
}): Promise<CjInventorySnapshotCsv> {
  const parts = parseDateKey(input.dateKey);
  const warehouseFilter = input.warehouseId
    ? Prisma.sql`AND t."cjAreaId" = ${input.warehouseId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<CjInventorySnapshotRow[]>(Prisma.sql`
    SELECT DISTINCT ON (t."sku", t."cjAreaId")
      t."sku",
      t."cjInternalSku",
      p."sku" AS "localSku",
      t."productName",
      t."cjProductName",
      t."cjAreaId",
      t."cjAreaEn",
      t."countryCode",
      t."countryNameEn",
      t."newTotalInventoryNum",
      t."newCjInventoryNum",
      t."newFactoryInventoryNum",
      t."observedAt"
    FROM "CjDropshippingInventoryTransaction" t
    LEFT JOIN "Product" p ON p."id" = t."productId"
    WHERE t."storeId" = ${input.storeId}::uuid
      AND t."observedAt" < ${asOfExclusiveEnd(parts)}
      ${warehouseFilter}
    ORDER BY t."sku", t."cjAreaId", t."observedAt" DESC
  `);

  return {
    dateKey: parts.dateKey,
    fileName: `cj-inventory-snapshot-${parts.dateKey}.csv`,
    contentType: SNAPSHOT_CONTENT_TYPE,
    body: buildCsv(rows),
    rowCount: rows.length,
  };
}
