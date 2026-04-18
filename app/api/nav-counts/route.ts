import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR, PURCHASE_ORDER_TYPE_STOCK } from "@/lib/purchase-order-type";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const [purchaseOrders, stockOrders, manufacturingOrders] = await Promise.all([
    prisma.purchaseOrder.count({
      where: {
        storeId,
        type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        status: { not: "closed" },
      },
    }),
    prisma.purchaseOrder.count({
      where: {
        storeId,
        type: PURCHASE_ORDER_TYPE_STOCK,
        status: { not: "closed" },
      },
    }),
    prisma.manufacturingOrder.count({
      where: {
        storeId,
        status: { not: "closed" },
      },
    }),
  ]);

  return NextResponse.json({ purchaseOrders, stockOrders, manufacturingOrders });
}
