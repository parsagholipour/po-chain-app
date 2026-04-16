import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const bySaleChannel = await prisma.purchaseOrder.groupBy({
    by: ["saleChannelId"],
    where: {
      storeId,
      type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
      status: { not: "closed" },
      saleChannelId: { not: null },
    },
    _count: { _all: true },
  });

  const saleChannelCounts: Record<string, number> = {};
  for (const row of bySaleChannel) {
    if (row.saleChannelId == null) continue;
    saleChannelCounts[row.saleChannelId] = row._count._all;
  }

  const byManufacturer = await prisma.manufacturingOrderManufacturer.groupBy({
    by: ["manufacturerId"],
    where: {
      storeId,
      manufacturingOrder: { status: { not: "closed" } },
    },
    _count: { _all: true },
  });

  const manufacturerCounts: Record<string, number> = {};
  for (const row of byManufacturer) {
    manufacturerCounts[row.manufacturerId] = row._count._all;
  }

  return NextResponse.json({
    bySaleChannel: saleChannelCounts,
    byManufacturer: manufacturerCounts,
  });
}
