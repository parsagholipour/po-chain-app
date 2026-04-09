import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { jsonError } from "@/lib/json-error";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const bySaleChannel = await prisma.purchaseOrder.groupBy({
    by: ["saleChannelId"],
    where: {
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
    where: { manufacturingOrder: { status: { not: "closed" } } },
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
