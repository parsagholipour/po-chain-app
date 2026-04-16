import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { prisma } from "@/lib/prisma";
import { parseAnalyticsRange, previousPeriod } from "@/lib/analytics/date-range";
import {
  getClosedPoLineTotals,
  getManufacturingSpend,
  getOpenOrderCounts,
  getProductLeaderboard,
  getRevenueSeries,
  getShippingSpend,
  metricDeltaPct,
} from "@/lib/analytics/queries";
import type { AnalyticsKpi } from "@/lib/types/analytics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const range = parseAnalyticsRange(searchParams);
  const prev = previousPeriod(range);

  const [current, previous, openCounts, trend, topProducts, manufacturingSpend, shippingSpend] =
    await Promise.all([
      getClosedPoLineTotals(storeId, range),
      getClosedPoLineTotals(storeId, prev),
      getOpenOrderCounts(storeId),
      getRevenueSeries(storeId, range),
      getProductLeaderboard(storeId, range, 5),
      getManufacturingSpend(storeId, range),
      getShippingSpend(storeId, range),
    ]);

  const kpis: AnalyticsKpi[] = [
    { label: "Revenue", value: current.revenue, deltaPct: metricDeltaPct(current.revenue, previous.revenue) },
    { label: "COGS", value: current.cost, deltaPct: metricDeltaPct(current.cost, previous.cost) },
    { label: "Gross profit", value: current.profit, deltaPct: metricDeltaPct(current.profit, previous.profit) },
    {
      label: "Margin %",
      value: current.revenue > 0 ? (current.profit / current.revenue) * 100 : 0,
      deltaPct: previous.revenue > 0 ? ((current.profit / current.revenue) * 100) - ((previous.profit / previous.revenue) * 100) : null,
    },
    { label: "Units sold", value: current.units, deltaPct: metricDeltaPct(current.units, previous.units) },
    { label: "Closed POs", value: await closedPoCount(storeId, range), deltaPct: null },
    { label: "Open POs", value: openCounts.openPo, deltaPct: null },
    { label: "Open SOs", value: openCounts.openSo, deltaPct: null },
    { label: "Open MOs", value: openCounts.openMo, deltaPct: null },
    { label: "Manufacturing spend", value: manufacturingSpend, deltaPct: null },
    { label: "Shipping spend", value: shippingSpend, deltaPct: null },
  ];

  return NextResponse.json({
    range,
    kpis,
    trend,
    topProducts,
  });
}

async function closedPoCount(storeId: string, range: { from: string; to: string }) {
  return prisma.purchaseOrder.count({
    where: {
      storeId,
      type: "distributor",
      status: "closed",
      updatedAt: {
        gte: new Date(`${range.from}T00:00:00.000Z`),
        lte: new Date(`${range.to}T23:59:59.999Z`),
      },
    },
  });
}
