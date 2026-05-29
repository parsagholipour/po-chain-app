import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import type { Prisma } from "@/app/generated/prisma/client";

export const runtime = "nodejs";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().trim().max(120).optional(),
  locationId: z.uuid().optional(),
});

function movementRow(row: {
  id: string;
  productId: string | null;
  productName: string;
  sku: string;
  shopifyLocationId: string | null;
  shopifyLocationName: string;
  shopifyLocationGid: string;
  previousOnHand: number | null;
  newOnHand: number;
  delta: number;
  trigger: string;
  syncRunId: string;
  observedAt: Date;
}) {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    sku: row.sku,
    shopifyLocationId: row.shopifyLocationId,
    shopifyLocationName: row.shopifyLocationName,
    shopifyLocationGid: row.shopifyLocationGid,
    previousOnHand: row.previousOnHand,
    newOnHand: row.newOnHand,
    delta: row.delta,
    trigger: row.trigger,
    syncRunId: row.syncRunId,
    observedAt: row.observedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const searchParams = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const { page, pageSize, q, locationId } = parsed.data;
  const where: Prisma.ShopifyInventoryMovementWhereInput = { storeId };
  if (locationId) where.shopifyLocationId = locationId;
  if (q) {
    where.OR = [
      { productName: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { shopifyLocationName: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, rows, locations] = await prisma.$transaction([
    prisma.shopifyInventoryMovement.count({ where }),
    prisma.shopifyInventoryMovement.findMany({
      where,
      orderBy: { observedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        productId: true,
        productName: true,
        sku: true,
        shopifyLocationId: true,
        shopifyLocationName: true,
        shopifyLocationGid: true,
        previousOnHand: true,
        newOnHand: true,
        delta: true,
        trigger: true,
        syncRunId: true,
        observedAt: true,
      },
    }),
    prisma.shopifyLocation.findMany({
      where: { storeId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        shopifyLocationGid: true,
        name: true,
        isActive: true,
      },
    }),
  ]);

  return NextResponse.json({
    rows: rows.map(movementRow),
    total,
    page,
    pageSize,
    locations,
  });
}
