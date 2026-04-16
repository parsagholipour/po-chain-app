import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { parseAnalyticsRange, toEndOfDay, toStartOfDay } from "@/lib/analytics/date-range";
import { prisma } from "@/lib/prisma";
import { closedDistributorPoWhere } from "@/lib/analytics/where";
import type { BreakdownRow } from "@/lib/types/analytics";

export const runtime = "nodejs";

function n(value: unknown): number {
  return Number(value ?? 0) || 0;
}

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const { searchParams } = new URL(request.url);
  const range = parseAnalyticsRange(searchParams);

  const [lineRows, spendRows, openMoRows, leadRows] = await Promise.all([
    prisma.purchaseOrderLine.findMany({
      where: { storeId, purchaseOrder: closedDistributorPoWhere(storeId, range) },
      select: {
        quantity: true,
        unitCost: true,
        unitPrice: true,
        product: {
          select: {
            defaultManufacturerId: true,
            defaultManufacturer: { select: { name: true } },
          },
        },
      },
    }),
    prisma.manufacturingOrderManufacturer.findMany({
      where: {
        storeId,
        OR: [
          { depositPaidAt: { gte: toStartOfDay(range.from), lte: toEndOfDay(range.to) } },
          { balancePaidAt: { gte: toStartOfDay(range.from), lte: toEndOfDay(range.to) } },
        ],
      },
      select: {
        manufacturerId: true,
        manufacturer: { select: { name: true } },
        depositPaidAmount: true,
        balancePaidAmount: true,
      },
    }),
    prisma.manufacturingOrderManufacturer.groupBy({
      by: ["manufacturerId"],
      where: {
        storeId,
        manufacturingOrder: { status: { not: "closed" } },
      },
      _count: { _all: true },
    }),
    prisma.manufacturingOrderManufacturer.findMany({
      where: {
        storeId,
        manufacturingStartedAt: { not: null },
        readyAt: { not: null },
      },
      select: {
        manufacturerId: true,
        manufacturingStartedAt: true,
        readyAt: true,
      },
    }),
  ]);

  const map = new Map<string, BreakdownRow & { manufacturingSpend: number; openMoCount: number; avgLeadDays: number }>();

  for (const row of lineRows) {
    const id = row.product.defaultManufacturerId;
    const label = row.product.defaultManufacturer.name;
    const current = map.get(id) ?? { id, label, revenue: 0, cost: 0, profit: 0, units: 0, marginPct: 0, manufacturingSpend: 0, openMoCount: 0, avgLeadDays: 0 };
    current.revenue += row.quantity * n(row.unitPrice);
    current.cost += row.quantity * n(row.unitCost);
    current.profit = current.revenue - current.cost;
    current.units += row.quantity;
    current.marginPct = current.revenue > 0 ? (current.profit / current.revenue) * 100 : 0;
    map.set(id, current);
  }

  for (const row of spendRows) {
    const current = map.get(row.manufacturerId) ?? {
      id: row.manufacturerId,
      label: row.manufacturer.name,
      revenue: 0,
      cost: 0,
      profit: 0,
      units: 0,
      marginPct: 0,
      manufacturingSpend: 0,
      openMoCount: 0,
      avgLeadDays: 0,
    };
    current.manufacturingSpend += n(row.depositPaidAmount) + n(row.balancePaidAmount);
    map.set(row.manufacturerId, current);
  }

  for (const row of openMoRows) {
    const current = map.get(row.manufacturerId);
    if (current) current.openMoCount = row._count._all;
  }

  const leadMap = new Map<string, number[]>();
  for (const row of leadRows) {
    if (!row.manufacturingStartedAt || !row.readyAt) continue;
    const days = (row.readyAt.getTime() - row.manufacturingStartedAt.getTime()) / (24 * 60 * 60 * 1000);
    leadMap.set(row.manufacturerId, [...(leadMap.get(row.manufacturerId) ?? []), days]);
  }
  for (const [manufacturerId, days] of leadMap.entries()) {
    const current = map.get(manufacturerId);
    if (!current) continue;
    current.avgLeadDays = days.reduce((sum, value) => sum + value, 0) / days.length;
  }

  return NextResponse.json({
    rows: [...map.values()].sort((a, b) => b.profit - a.profit),
  });
}
