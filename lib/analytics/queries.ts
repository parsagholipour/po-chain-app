import type { PurchaseOrderStatus } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { closedDistributorPoWhere, closedStockOrderWhere, shippingDateWhere } from "@/lib/analytics/where";
import type {
  AnalyticsRange,
  BreakdownRow,
  InflowOutflowRow,
  ProductLeaderboardRow,
  TimeSeriesPoint,
} from "@/lib/types/analytics";

function num(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "object" && "toString" in (value as Record<string, unknown>)) {
    return Number((value as { toString(): string }).toString()) || 0;
  }
  return 0;
}

function marginPct(revenue: number, profit: number): number {
  if (revenue <= 0) return 0;
  return (profit / revenue) * 100;
}

export async function getRevenueSeries(storeId: string, range: AnalyticsRange): Promise<TimeSeriesPoint[]> {
  const orders = await prisma.purchaseOrder.findMany({
    where: closedDistributorPoWhere(storeId, range),
    select: {
      updatedAt: true,
      lines: {
        select: {
          quantity: true,
          unitCost: true,
          unitPrice: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  const buckets = new Map<string, TimeSeriesPoint>();
  for (const order of orders) {
    const bucket = formatBucket(order.updatedAt, range.granularity);
    const current = buckets.get(bucket) ?? { bucket, revenue: 0, cost: 0, profit: 0, units: 0 };
    for (const line of order.lines) {
      const revenue = line.quantity * num(line.unitPrice);
      const cost = line.quantity * num(line.unitCost);
      current.revenue += revenue;
      current.cost += cost;
      current.profit += revenue - cost;
      current.units += line.quantity;
    }
    buckets.set(bucket, current);
  }

  return [...buckets.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export async function getClosedPoLineTotals(storeId: string, range: AnalyticsRange) {
  const rows = await prisma.purchaseOrderLine.findMany({
    where: {
      storeId,
      purchaseOrder: closedDistributorPoWhere(storeId, range),
    },
    select: {
      quantity: true,
      unitCost: true,
      unitPrice: true,
    },
  });

  let revenue = 0;
  let cost = 0;
  let units = 0;
  for (const row of rows) {
    revenue += row.quantity * num(row.unitPrice);
    cost += row.quantity * num(row.unitCost);
    units += row.quantity;
  }
  return { revenue, cost, profit: revenue - cost, units };
}

export async function getProductLeaderboard(storeId: string, range: AnalyticsRange, limit = 10): Promise<ProductLeaderboardRow[]> {
  const rows = await prisma.purchaseOrderLine.findMany({
    where: {
      storeId,
      purchaseOrder: closedDistributorPoWhere(storeId, range),
    },
    select: {
      quantity: true,
      unitCost: true,
      unitPrice: true,
      product: { select: { id: true, name: true, sku: true } },
    },
  });

  const map = new Map<string, ProductLeaderboardRow>();
  for (const row of rows) {
    const key = row.product.id;
    const current =
      map.get(key) ??
      ({
        id: row.product.id,
        label: row.product.name,
        sku: row.product.sku,
        revenue: 0,
        cost: 0,
        profit: 0,
        units: 0,
        marginPct: 0,
      } satisfies ProductLeaderboardRow);
    current.revenue += row.quantity * num(row.unitPrice);
    current.cost += row.quantity * num(row.unitCost);
    current.profit = current.revenue - current.cost;
    current.units += row.quantity;
    current.marginPct = marginPct(current.revenue, current.profit);
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => b.profit - a.profit).slice(0, limit);
}

export async function getBreakdownByChannel(storeId: string, range: AnalyticsRange): Promise<BreakdownRow[]> {
  const rows = await prisma.purchaseOrder.findMany({
    where: closedDistributorPoWhere(storeId, range),
    select: {
      saleChannelId: true,
      saleChannel: { select: { name: true } },
      lines: { select: { quantity: true, unitCost: true, unitPrice: true } },
    },
  });

  const map = new Map<string, BreakdownRow>();
  for (const order of rows) {
    const id = order.saleChannelId ?? "unassigned";
    const label = order.saleChannel?.name ?? "Unassigned";
    const current = map.get(id) ?? { id, label, revenue: 0, cost: 0, profit: 0, units: 0, marginPct: 0 };
    for (const line of order.lines) {
      current.revenue += line.quantity * num(line.unitPrice);
      current.cost += line.quantity * num(line.unitCost);
      current.units += line.quantity;
    }
    current.profit = current.revenue - current.cost;
    current.marginPct = marginPct(current.revenue, current.profit);
    map.set(id, current);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export async function getOpenOrderCounts(storeId: string) {
  const [openPo, openSo, openMo] = await Promise.all([
    prisma.purchaseOrder.count({
      where: { storeId, type: "distributor", status: { not: "closed" } },
    }),
    prisma.purchaseOrder.count({
      where: { storeId, type: "stock", status: { not: "closed" } },
    }),
    prisma.manufacturingOrder.count({
      where: { storeId, status: { not: "closed" } },
    }),
  ]);
  return { openPo, openSo, openMo };
}

export async function getManufacturingSpend(storeId: string, range: AnalyticsRange): Promise<number> {
  const rows = await prisma.manufacturingOrderManufacturer.findMany({
    where: {
      storeId,
      OR: [
        { depositPaidAt: { gte: new Date(`${range.from}T00:00:00.000Z`), lte: new Date(`${range.to}T23:59:59.999Z`) } },
        { balancePaidAt: { gte: new Date(`${range.from}T00:00:00.000Z`), lte: new Date(`${range.to}T23:59:59.999Z`) } },
      ],
    },
    select: { depositPaidAmount: true, balancePaidAmount: true },
  });
  return rows.reduce((sum, row) => sum + num(row.depositPaidAmount) + num(row.balancePaidAmount), 0);
}

export async function getShippingSpend(storeId: string, range: AnalyticsRange): Promise<number> {
  const rows = await prisma.shipping.findMany({
    where: { storeId, ...shippingDateWhere(range) },
    select: { cost: true },
  });
  return rows.reduce((sum, row) => sum + num(row.cost), 0);
}

export async function getPipelineStatusCounts(storeId: string) {
  const [po, so, mo, shipping] = await Promise.all([
    prisma.purchaseOrder.groupBy({
      by: ["status"],
      where: { storeId, type: "distributor" },
      _count: { _all: true },
    }),
    prisma.purchaseOrder.groupBy({
      by: ["status"],
      where: { storeId, type: "stock" },
      _count: { _all: true },
    }),
    prisma.manufacturingOrder.groupBy({
      by: ["status"],
      where: { storeId },
      _count: { _all: true },
    }),
    prisma.shipping.groupBy({
      by: ["status"],
      where: { storeId },
      _count: { _all: true },
    }),
  ]);

  return {
    purchaseOrders: toCountRecord(po),
    stockOrders: toCountRecord(so),
    manufacturingOrders: toCountRecord(mo),
    shipping: toCountRecord(shipping),
  };
}

function toCountRecord(rows: Array<{ status: string; _count: { _all: number } }>) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});
}

function formatBucket(value: Date, granularity: AnalyticsRange["granularity"]): string {
  const date = new Date(value);
  if (granularity === "month") return date.toISOString().slice(0, 7);
  if (granularity === "week") {
    const start = new Date(date);
    const day = start.getUTCDay();
    const offset = day === 0 ? -6 : 1 - day;
    start.setUTCDate(start.getUTCDate() + offset);
    return start.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export function countByStatus(rows: { status: PurchaseOrderStatus; _count: { _all: number } }[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});
}

export function metricDeltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export async function getStockInflowOutflowByProduct(
  storeId: string,
  range: AnalyticsRange,
): Promise<InflowOutflowRow[]> {
  const [stockRows, distRows] = await Promise.all([
    prisma.purchaseOrderLine.findMany({
      where: { storeId, purchaseOrder: closedStockOrderWhere(storeId, range) },
      select: { quantity: true, product: { select: { id: true, name: true } } },
    }),
    prisma.purchaseOrderLine.findMany({
      where: { storeId, purchaseOrder: closedDistributorPoWhere(storeId, range) },
      select: { quantity: true, product: { select: { id: true, name: true } } },
    }),
  ]);

  const map = new Map<string, InflowOutflowRow>();
  for (const row of stockRows) {
    const current =
      map.get(row.product.id) ??
      ({ id: row.product.id, label: row.product.name, inflowUnits: 0, outflowUnits: 0, netUnits: 0 } satisfies InflowOutflowRow);
    current.inflowUnits += row.quantity;
    current.netUnits = current.inflowUnits - current.outflowUnits;
    map.set(row.product.id, current);
  }
  for (const row of distRows) {
    const current =
      map.get(row.product.id) ??
      ({ id: row.product.id, label: row.product.name, inflowUnits: 0, outflowUnits: 0, netUnits: 0 } satisfies InflowOutflowRow);
    current.outflowUnits += row.quantity;
    current.netUnits = current.inflowUnits - current.outflowUnits;
    map.set(row.product.id, current);
  }
  return [...map.values()].sort((a, b) => b.inflowUnits + b.outflowUnits - (a.inflowUnits + a.outflowUnits));
}
