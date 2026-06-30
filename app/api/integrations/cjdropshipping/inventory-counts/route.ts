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

function countRow(row: {
  id: string;
  productId: string | null;
  sku: string;
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
  lastSyncedAt: Date;
  lastSyncTrigger: string;
  product: { id: string; name: string; sku: string } | null;
}) {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product?.name ?? row.cjProductName ?? null,
    sku: row.sku,
    localSku: row.product?.sku ?? null,
    cjProductId: row.cjProductId,
    cjVariantId: row.cjVariantId,
    cjProductName: row.cjProductName,
    cjAreaId: row.cjAreaId,
    cjAreaEn: row.cjAreaEn,
    countryCode: row.countryCode,
    countryNameEn: row.countryNameEn,
    totalInventoryNum: row.totalInventoryNum,
    cjInventoryNum: row.cjInventoryNum,
    factoryInventoryNum: row.factoryInventoryNum,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    lastSyncTrigger: row.lastSyncTrigger,
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
  const where: Prisma.CjDropshippingInventoryCountWhereInput = { storeId };
  if (warehouseId) where.cjAreaId = warehouseId;
  if (q) {
    where.OR = [
      { sku: { contains: q, mode: "insensitive" } },
      { cjProductName: { contains: q, mode: "insensitive" } },
      { cjAreaEn: { contains: q, mode: "insensitive" } },
      { countryNameEn: { contains: q, mode: "insensitive" } },
      { countryCode: { contains: q, mode: "insensitive" } },
      { product: { name: { contains: q, mode: "insensitive" } } },
      { product: { sku: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, rows, warehouseRows] = await prisma.$transaction([
    prisma.cjDropshippingInventoryCount.count({ where }),
    prisma.cjDropshippingInventoryCount.findMany({
      where,
      orderBy: [{ sku: "asc" }, { cjAreaEn: "asc" }, { cjAreaId: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
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
        lastSyncedAt: true,
        lastSyncTrigger: true,
        product: { select: { id: true, name: true, sku: true } },
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
    rows: rows.map(countRow),
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
