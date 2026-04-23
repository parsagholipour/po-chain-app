import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR, PURCHASE_ORDER_TYPE_STOCK } from "@/lib/purchase-order-type";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const TAKE_EACH = 8;
const LIMIT = 5;

export async function GET() {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const notClosed = { not: "closed" as const };

  const [distributorPos, stockOrders, manufacturingOrders] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { storeId, type: PURCHASE_ORDER_TYPE_DISTRIBUTOR, status: notClosed },
      orderBy: { updatedAt: "desc" },
      take: TAKE_EACH,
      select: { id: true, name: true, number: true, status: true, updatedAt: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { storeId, type: PURCHASE_ORDER_TYPE_STOCK, status: notClosed },
      orderBy: { updatedAt: "desc" },
      take: TAKE_EACH,
      select: { id: true, name: true, number: true, status: true, updatedAt: true },
    }),
    prisma.manufacturingOrder.findMany({
      where: { storeId, status: notClosed },
      orderBy: { updatedAt: "desc" },
      take: TAKE_EACH,
      select: { id: true, name: true, number: true, status: true, updatedAt: true },
    }),
  ]);

  const merged = [
    ...distributorPos.map((r) => ({ ...r, kind: "po" as const })),
    ...stockOrders.map((r) => ({ ...r, kind: "so" as const })),
    ...manufacturingOrders.map((r) => ({ ...r, kind: "mo" as const })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, LIMIT)
    .map((r) => ({
      kind: r.kind,
      id: r.id,
      name: r.name,
      number: r.number,
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
    }));

  return NextResponse.json({ items: merged });
}
