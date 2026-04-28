import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { parseAnalyticsRange } from "@/lib/analytics/date-range";
import { closedDistributorPoWhere } from "@/lib/analytics/where";
import { prisma } from "@/lib/prisma";
import { getBreakdownByChannel } from "@/lib/analytics/queries";
import type { BreakdownRow } from "@/lib/types/analytics";

export const runtime = "nodejs";

function numberValue(value: unknown): number {
  if (value == null) return 0;
  return Number(value) || 0;
}

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const range = parseAnalyticsRange(searchParams);
  const by = searchParams.get("by") ?? "channel";

  let rows: BreakdownRow[] = [];
  if (by === "channel") {
    rows = await getBreakdownByChannel(storeId, range);
  } else {
    const lineRows = await prisma.purchaseOrderLine.findMany({
      where: {
        storeId,
        purchaseOrder: closedDistributorPoWhere(storeId, range),
      },
      select: {
        quantity: true,
        unitCost: true,
        unitPrice: true,
        product: {
          select: {
            categoryId: true,
            category: { select: { name: true } },
            typeId: true,
            type: { select: { name: true } },
            defaultManufacturerId: true,
            defaultManufacturer: { select: { name: true } },
          },
        },
      },
    });

    const map = new Map<string, BreakdownRow>();
    for (const line of lineRows) {
      const target =
        by === "category"
          ? { id: line.product.categoryId ?? "uncategorized", label: line.product.category?.name ?? "Uncategorized" }
          : by === "type"
            ? { id: line.product.typeId ?? "untyped", label: line.product.type?.name ?? "No type" }
          : {
              id: line.product.defaultManufacturerId,
              label: line.product.defaultManufacturer.name,
            };
      const current = map.get(target.id) ?? {
        id: target.id,
        label: target.label,
        revenue: 0,
        cost: 0,
        profit: 0,
        units: 0,
        marginPct: 0,
      };
      current.revenue += line.quantity * numberValue(line.unitPrice);
      current.cost += line.quantity * numberValue(line.unitCost);
      current.units += line.quantity;
      current.profit = current.revenue - current.cost;
      current.marginPct = current.revenue > 0 ? (current.profit / current.revenue) * 100 : 0;
      map.set(target.id, current);
    }
    rows = [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }

  return NextResponse.json({ by, rows });
}
