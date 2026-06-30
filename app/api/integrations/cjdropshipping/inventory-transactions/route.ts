import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().trim().max(120).optional(),
  warehouseId: z.string().trim().max(120).optional(),
});

function transactionRow(row: {
  id: string;
  productId: string | null;
  productName: string | null;
  sku: string;
  cjProductId: string | null;
  cjVariantId: string | null;
  cjProductName: string | null;
  cjAreaId: string;
  cjAreaEn: string | null;
  countryCode: string | null;
  countryNameEn: string | null;
  previousTotalInventoryNum: number | null;
  newTotalInventoryNum: number;
  previousCjInventoryNum: number | null;
  newCjInventoryNum: number;
  previousFactoryInventoryNum: number | null;
  newFactoryInventoryNum: number;
  delta: number;
  movementType: string;
  trigger: string;
  syncRunId: string;
  observedAt: Date;
}) {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productName ?? row.cjProductName ?? null,
    sku: row.sku,
    cjProductId: row.cjProductId,
    cjVariantId: row.cjVariantId,
    cjProductName: row.cjProductName,
    cjAreaId: row.cjAreaId,
    cjAreaEn: row.cjAreaEn,
    countryCode: row.countryCode,
    countryNameEn: row.countryNameEn,
    previousTotalInventoryNum: row.previousTotalInventoryNum,
    newTotalInventoryNum: row.newTotalInventoryNum,
    previousCjInventoryNum: row.previousCjInventoryNum,
    newCjInventoryNum: row.newCjInventoryNum,
    previousFactoryInventoryNum: row.previousFactoryInventoryNum,
    newFactoryInventoryNum: row.newFactoryInventoryNum,
    delta: row.delta,
    movementType: row.movementType,
    trigger: row.trigger,
    syncRunId: row.syncRunId,
    observedAt: row.observedAt.toISOString(),
  };
}

function warehouseLabel(row: {
  cjAreaId: string;
  cjAreaEn: string | null;
  countryCode: string | null;
  countryNameEn: string | null;
}) {
  const name = row.cjAreaEn ?? row.countryNameEn ?? row.countryCode ?? row.cjAreaId;
  return row.countryCode && name !== row.countryCode ? `${name} (${row.countryCode})` : name;
}

export async function GET(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const searchParams = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const { page, pageSize, q, warehouseId } = parsed.data;
  const where: Prisma.CjDropshippingInventoryTransactionWhereInput = { storeId };
  if (warehouseId) where.cjAreaId = warehouseId;
  if (q) {
    where.OR = [
      { sku: { contains: q, mode: "insensitive" } },
      { productName: { contains: q, mode: "insensitive" } },
      { cjProductName: { contains: q, mode: "insensitive" } },
      { cjAreaEn: { contains: q, mode: "insensitive" } },
      { countryNameEn: { contains: q, mode: "insensitive" } },
      { countryCode: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, rows, warehouseRows] = await prisma.$transaction([
    prisma.cjDropshippingInventoryTransaction.count({ where }),
    prisma.cjDropshippingInventoryTransaction.findMany({
      where,
      orderBy: { observedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        productId: true,
        productName: true,
        sku: true,
        cjProductId: true,
        cjVariantId: true,
        cjProductName: true,
        cjAreaId: true,
        cjAreaEn: true,
        countryCode: true,
        countryNameEn: true,
        previousTotalInventoryNum: true,
        newTotalInventoryNum: true,
        previousCjInventoryNum: true,
        newCjInventoryNum: true,
        previousFactoryInventoryNum: true,
        newFactoryInventoryNum: true,
        delta: true,
        movementType: true,
        trigger: true,
        syncRunId: true,
        observedAt: true,
      },
    }),
    prisma.cjDropshippingInventoryCount.findMany({
      where: { storeId },
      orderBy: [{ cjAreaEn: "asc" }, { cjAreaId: "asc" }],
      select: {
        cjAreaId: true,
        cjAreaEn: true,
        countryCode: true,
        countryNameEn: true,
      },
    }),
  ]);

  const warehousesById = new Map<string, (typeof warehouseRows)[number]>();
  for (const row of warehouseRows) {
    if (!warehousesById.has(row.cjAreaId)) warehousesById.set(row.cjAreaId, row);
  }

  return NextResponse.json({
    rows: rows.map(transactionRow),
    total,
    page,
    pageSize,
    warehouses: [...warehousesById.values()].map((row) => ({
      id: row.cjAreaId,
      label: warehouseLabel(row),
      cjAreaId: row.cjAreaId,
      cjAreaEn: row.cjAreaEn,
      countryCode: row.countryCode,
      countryNameEn: row.countryNameEn,
    })),
  });
}
