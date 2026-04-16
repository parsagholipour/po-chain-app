import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { parseAnalyticsRange } from "@/lib/analytics/date-range";
import { getStockInflowOutflowByProduct } from "@/lib/analytics/queries";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const { searchParams } = new URL(request.url);
  const range = parseAnalyticsRange(searchParams);

  const [inflowOutflow, stockStatus] = await Promise.all([
    getStockInflowOutflowByProduct(storeId, range),
    prisma.purchaseOrder.groupBy({
      by: ["status"],
      where: { storeId, type: "stock" },
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({
    inflowOutflow,
    statusCounts: stockStatus.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {}),
  });
}
