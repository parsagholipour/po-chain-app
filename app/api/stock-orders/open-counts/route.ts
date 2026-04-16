import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreContext } from "@/lib/store-context";
import { PURCHASE_ORDER_TYPE_STOCK } from "@/lib/purchase-order-type";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  /** Distinct open stock POs per manufacturer (matches GET /api/stock-orders manufacturer filter). */
  const allocations = await prisma.manufacturingOrderPurchaseOrderLine.findMany({
    where: {
      storeId,
      purchaseOrderLine: {
        storeId,
        purchaseOrder: {
          storeId,
          type: PURCHASE_ORDER_TYPE_STOCK,
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

  return NextResponse.json({ byManufacturer: manufacturerCounts });
}
