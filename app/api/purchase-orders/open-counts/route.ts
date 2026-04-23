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

  /** Distinct open distributor POs per manufacturer (matches GET /api/purchase-orders manufacturer filter). */
  const allocations = await prisma.manufacturingOrderPurchaseOrderLine.findMany({
    where: {
      storeId,
      purchaseOrderLine: {
        storeId,
        purchaseOrder: {
          storeId,
          type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
          status: { not: "closed" },
        },
      },
    },
    select: {
      manufacturerId: true,
      purchaseOrderLine: { select: { purchaseOrderId: true } },
    },
  });

  const orderIdsByManufacturer = new Map<string, Set<string>>();
  for (const row of allocations) {
    const poId = row.purchaseOrderLine.purchaseOrderId;
    let set = orderIdsByManufacturer.get(row.manufacturerId);
    if (!set) {
      set = new Set();
      orderIdsByManufacturer.set(row.manufacturerId, set);
    }
    set.add(poId);
  }

  const manufacturerCounts: Record<string, number> = {};
  for (const [manufacturerId, ids] of orderIdsByManufacturer) {
    manufacturerCounts[manufacturerId] = ids.size;
  }

  return NextResponse.json({
    bySaleChannel: saleChannelCounts,
    byManufacturer: manufacturerCounts,
  });
}
