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

function countRow(row: {
  id: string;
  onHand: number;
  lastSyncedAt: Date;
  lastSyncTrigger: string;
  inventoryLevelActive: boolean | null;
  product: { id: string; name: string; sku: string };
  shopifyLocation: {
    id: string;
    shopifyLocationGid: string;
    name: string;
    isActive: boolean;
  };
}) {
  return {
    id: row.id,
    productId: row.product.id,
    productName: row.product.name,
    sku: row.product.sku,
    shopifyLocationId: row.shopifyLocation.id,
    shopifyLocationGid: row.shopifyLocation.shopifyLocationGid,
    shopifyLocationName: row.shopifyLocation.name,
    shopifyLocationIsActive: row.shopifyLocation.isActive,
    inventoryLevelActive: row.inventoryLevelActive,
    onHand: row.onHand,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    lastSyncTrigger: row.lastSyncTrigger,
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
  const where: Prisma.ShopifyInventoryCountWhereInput = { storeId };
  if (locationId) where.shopifyLocationId = locationId;
  if (q) {
    where.OR = [
      { product: { name: { contains: q, mode: "insensitive" } } },
      { product: { sku: { contains: q, mode: "insensitive" } } },
      { shopifyLocation: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, rows, locations] = await prisma.$transaction([
    prisma.shopifyInventoryCount.count({ where }),
    prisma.shopifyInventoryCount.findMany({
      where,
      orderBy: [
        { product: { sku: "asc" } },
        { shopifyLocation: { name: "asc" } },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        onHand: true,
        lastSyncedAt: true,
        lastSyncTrigger: true,
        inventoryLevelActive: true,
        product: { select: { id: true, name: true, sku: true } },
        shopifyLocation: {
          select: {
            id: true,
            shopifyLocationGid: true,
            name: true,
            isActive: true,
          },
        },
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
    rows: rows.map(countRow),
    total,
    page,
    pageSize,
    locations,
  });
}
