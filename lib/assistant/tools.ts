import "server-only";

import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAnalyticsRange, previousPeriod } from "@/lib/analytics/date-range";
import {
  getClosedPoLineTotals,
  getManufacturingSpend,
  getOpenOrderCounts,
  getPipelineStatusCounts,
  getProductLeaderboard,
  getShippingSpend,
  metricDeltaPct,
} from "@/lib/analytics/queries";
import { shippingDateWhere } from "@/lib/analytics/where";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";
import {
  distributorPoStatusLabels,
  distributorPoStatuses,
  moStatusLabels,
  moStatuses,
  shippingStatusLabels,
  shippingStatuses,
} from "@/lib/po/status-labels";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR, PURCHASE_ORDER_TYPE_STOCK } from "@/lib/purchase-order-type";
import { purchaseOrderDetailInclude } from "@/lib/purchase-order-include";
import { shippingRowFromPrisma, purchaseOrderDetailFromPrisma, manufacturingOrderDetailFromPrisma } from "@/lib/shipping-api";
import { shippingDetailInclude } from "@/lib/shipping-include";
import { shippingTypeLabels } from "@/lib/shipping";
import type { AssistantPageContext, AssistantSource } from "@/lib/types/assistant";
import type { AnalyticsRange } from "@/lib/types/analytics";

const uuidSchema = z.uuid();

type AssistantToolName =
  | "get_dashboard_overview"
  | "get_recent_open_items"
  | "search_orders"
  | "get_purchase_order"
  | "get_stock_order"
  | "get_manufacturing_order"
  | "get_shipping"
  | "search_master_data"
  | "get_current_page_record";

type AssistantToolContext = {
  storeId: string;
  pageContext: AssistantPageContext | null;
};

type ToolExecutionResult = {
  result: unknown;
  sources: AssistantSource[];
};

type AssistantToolDefinition = {
  type: "function";
  function: {
    name: AssistantToolName;
    description: string;
    strict: true;
    parameters: Record<string, unknown>;
  };
};

const emptyObjectJsonSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

const dashboardArgsSchema = z.object({
  from: z.string(),
  to: z.string(),
  granularity: z.enum(["", "day", "week", "month"]),
});

const searchOrdersArgsSchema = z.object({
  kind: z.enum(["po", "so", "mo", "shipping", "any"]),
  query: z.string(),
  status: z.string(),
});

const searchMasterDataArgsSchema = z.object({
  kind: z.enum(["product", "manufacturer", "sale_channel", "logistics_partner", "any"]),
  query: z.string(),
});

const idArgsSchema = z.object({ id: z.uuid() });

export const assistantToolDefinitions: AssistantToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_dashboard_overview",
      description:
        "Get store-scoped dashboard and KPI data. Use empty strings to fall back to the current page range or the default range.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD date or empty string." },
          to: { type: "string", description: "YYYY-MM-DD date or empty string." },
          granularity: {
            type: "string",
            enum: ["", "day", "week", "month"],
            description: "Granularity or empty string.",
          },
        },
        required: ["from", "to", "granularity"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_open_items",
      description: "Get the most recently updated open purchase, stock, and manufacturing orders.",
      strict: true,
      parameters: emptyObjectJsonSchema,
    },
  },
  {
    type: "function",
    function: {
      name: "search_orders",
      description:
        "Search purchase orders, stock orders, manufacturing orders, or shipments. Leave query empty when filtering only by status.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["po", "so", "mo", "shipping", "any"],
            description: "Which order family to search.",
          },
          query: { type: "string", description: "Search text, order number text, tracking number, or empty string." },
          status: { type: "string", description: "Exact status filter or empty string." },
        },
        required: ["kind", "query", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_purchase_order",
      description: "Get a distributor purchase order by UUID.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Purchase order UUID." },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stock_order",
      description: "Get a stock order by UUID.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Stock order UUID." },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_manufacturing_order",
      description: "Get a manufacturing order by UUID.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Manufacturing order UUID." },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shipping",
      description: "Get a shipment record by UUID.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shipment UUID." },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_master_data",
      description:
        "Search products, manufacturers, sale channels, or logistics partners. Use kind=any to search across all master data.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["product", "manufacturer", "sale_channel", "logistics_partner", "any"],
            description: "Which master-data family to search.",
          },
          query: { type: "string", description: "Name, SKU, region, or other search text." },
        },
        required: ["kind", "query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_page_record",
      description:
        "Get the structured record or analytics summary for the current supported page context attached to the request.",
      strict: true,
      parameters: emptyObjectJsonSchema,
    },
  },
];

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "object" && value !== null && "toString" in value) {
    return Number((value as { toString(): string }).toString()) || 0;
  }
  return 0;
}

function dedupeSources(sources: AssistantSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.kind}:${source.id}:${source.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSource(kind: AssistantSource["kind"], id: string, label: string, href: string): AssistantSource {
  return { kind, id, label, href };
}

function cleanText(value: string) {
  return value.trim();
}

function parseToolArguments<T extends z.ZodTypeAny>(schema: T, rawArguments: string) {
  try {
    const parsed = rawArguments.trim() === "" ? {} : JSON.parse(rawArguments);
    return schema.safeParse(parsed);
  } catch {
    return schema.safeParse({});
  }
}

function buildRangeFromInputs(
  args: z.infer<typeof dashboardArgsSchema>,
  pageContext: AssistantPageContext | null,
) {
  const params = new URLSearchParams(pageContext?.search ?? "");
  const from = cleanText(args.from);
  const to = cleanText(args.to);
  const granularity = cleanText(args.granularity);

  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (granularity) params.set("granularity", granularity);

  return parseAnalyticsRange(params);
}

function buildAnalyticsHref(pathname: string, range: AnalyticsRange) {
  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    granularity: range.granularity,
  });
  return `${pathname}?${params.toString()}`;
}

function looksLikeUuid(value: string) {
  return uuidSchema.safeParse(value).success;
}

async function getShippingAnalyticsSummary(storeId: string, range: AnalyticsRange) {
  const rows = await prisma.shipping.findMany({
    where: { storeId, ...shippingDateWhere(range) },
    select: {
      status: true,
      type: true,
      cost: true,
      deliveryDutiesPaid: true,
      createdAt: true,
      shippedAt: true,
      logisticsPartner: { select: { name: true } },
    },
  });

  const byPartner: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let ddpCount = 0;
  let leadTimeDays = 0;

  for (const row of rows) {
    const partner = row.logisticsPartner?.name ?? "Unassigned";
    byPartner[partner] = (byPartner[partner] ?? 0) + toNumber(row.cost);
    byType[row.type] = (byType[row.type] ?? 0) + toNumber(row.cost);
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    if (row.deliveryDutiesPaid) ddpCount += 1;
    const end = row.shippedAt ?? row.createdAt;
    leadTimeDays += Math.max(
      0,
      (end.getTime() - row.createdAt.getTime()) / (24 * 60 * 60 * 1000),
    );
  }

  return {
    range,
    byPartner,
    byType,
    byStatus,
    ddpSharePct: rows.length ? (ddpCount / rows.length) * 100 : 0,
    avgLeadTimeDays: rows.length ? leadTimeDays / rows.length : 0,
  };
}

async function getManufacturingAnalyticsSummary(
  storeId: string,
  range: AnalyticsRange,
) {
  const [pipeline, manufacturerFunnel, outstandingBalances, verifiedCounts] = await Promise.all([
    getPipelineStatusCounts(storeId),
    prisma.manufacturingOrderManufacturer.groupBy({
      by: ["status"],
      where: { storeId },
      _count: { _all: true },
    }),
    prisma.manufacturingOrderManufacturer.count({
      where: { storeId, depositPaidAt: { not: null }, balancePaidAt: null },
    }),
    prisma.manufacturingOrderPurchaseOrderLine.groupBy({
      by: ["verified"],
      where: { storeId },
      _count: { _all: true },
    }),
  ]);

  return {
    range,
    pipeline,
    manufacturerFunnel: manufacturerFunnel.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {}),
    outstandingBalances,
    verifiedCounts: verifiedCounts.reduce<Record<string, number>>((acc, row) => {
      acc[row.verified ? "verified" : "unverified"] = row._count._all;
      return acc;
    }, { verified: 0, unverified: 0 }),
  };
}

async function getDashboardOverviewTool(
  args: z.infer<typeof dashboardArgsSchema>,
  context: AssistantToolContext,
): Promise<ToolExecutionResult> {
  const range = buildRangeFromInputs(args, context.pageContext);
  const previous = previousPeriod(range);

  const [current, prior, openCounts, topProducts, manufacturingSpend, shippingSpend, pipeline] =
    await Promise.all([
      getClosedPoLineTotals(context.storeId, range),
      getClosedPoLineTotals(context.storeId, previous),
      getOpenOrderCounts(context.storeId),
      getProductLeaderboard(context.storeId, range, 5),
      getManufacturingSpend(context.storeId, range),
      getShippingSpend(context.storeId, range),
      getPipelineStatusCounts(context.storeId),
    ]);

  const shippingSummary = await getShippingAnalyticsSummary(context.storeId, range);

  const sourceHref = buildAnalyticsHref("/", range);

  return {
    result: {
      range,
      kpis: {
        revenue: {
          value: current.revenue,
          deltaPct: metricDeltaPct(current.revenue, prior.revenue),
        },
        cogs: {
          value: current.cost,
          deltaPct: metricDeltaPct(current.cost, prior.cost),
        },
        grossProfit: {
          value: current.profit,
          deltaPct: metricDeltaPct(current.profit, prior.profit),
        },
        unitsSold: {
          value: current.units,
          deltaPct: metricDeltaPct(current.units, prior.units),
        },
        openPurchaseOrders: openCounts.openPo,
        openStockOrders: openCounts.openSo,
        openManufacturingOrders: openCounts.openMo,
        manufacturingSpend,
        shippingSpend,
      },
      topProducts: topProducts.map((product) => ({
        id: product.id,
        label: product.label,
        sku: product.sku,
        profit: product.profit,
        revenue: product.revenue,
        units: product.units,
        marginPct: product.marginPct,
      })),
      pipeline,
      shippingSummary,
    },
    sources: [
      buildSource(
        "dashboard",
        `dashboard:${range.from}:${range.to}:${range.granularity}`,
        `Dashboard overview (${range.from} to ${range.to})`,
        sourceHref,
      ),
    ],
  };
}

async function getRecentOpenItemsTool(context: AssistantToolContext): Promise<ToolExecutionResult> {
  const takeEach = 8;
  const notClosed = { not: "closed" as const };

  const [distributorOrders, stockOrders, manufacturingOrders] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: {
        storeId: context.storeId,
        type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        status: notClosed,
      },
      orderBy: { updatedAt: "desc" },
      take: takeEach,
      select: { id: true, name: true, number: true, status: true, updatedAt: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { storeId: context.storeId, type: PURCHASE_ORDER_TYPE_STOCK, status: notClosed },
      orderBy: { updatedAt: "desc" },
      take: takeEach,
      select: { id: true, name: true, number: true, status: true, updatedAt: true },
    }),
    prisma.manufacturingOrder.findMany({
      where: { storeId: context.storeId, status: notClosed },
      orderBy: { updatedAt: "desc" },
      take: takeEach,
      select: { id: true, name: true, number: true, status: true, updatedAt: true },
    }),
  ]);

  const items = [
    ...distributorOrders.map((row) => ({
      kind: "purchase_order" as const,
      id: row.id,
      number: row.number,
      name: row.name,
      status: row.status,
      updatedAt: row.updatedAt,
      href: `/purchase-orders/${row.id}`,
      label: `PO #${row.number} - ${row.name}`,
    })),
    ...stockOrders.map((row) => ({
      kind: "stock_order" as const,
      id: row.id,
      number: row.number,
      name: row.name,
      status: row.status,
      updatedAt: row.updatedAt,
      href: `/stock-orders/${row.id}`,
      label: `Stock #${row.number} - ${row.name}`,
    })),
    ...manufacturingOrders.map((row) => ({
      kind: "manufacturing_order" as const,
      id: row.id,
      number: row.number,
      name: row.name,
      status: row.status,
      updatedAt: row.updatedAt,
      href: `/manufacturing-orders/${row.id}`,
      label: `MO #${row.number} - ${row.name}`,
    })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5);

  return {
    result: {
      items: items.map((item) => ({
        kind: item.kind,
        id: item.id,
        number: item.number,
        name: item.name,
        status: item.status,
        updatedAt: item.updatedAt.toISOString(),
      })),
    },
    sources: items.map((item) =>
      buildSource(item.kind, item.id, item.label, item.href),
    ),
  };
}

async function searchOrdersTool(
  args: z.infer<typeof searchOrdersArgsSchema>,
  context: AssistantToolContext,
): Promise<ToolExecutionResult> {
  const query = cleanText(args.query);
  const status = cleanText(args.status);
  const queryNumber = Number.parseInt(query, 10);
  const limit = 8;

  const shouldSearch = (kind: z.infer<typeof searchOrdersArgsSchema>["kind"], target: string) =>
    kind === "any" || kind === target;
  const poStatusFilter = distributorPoStatuses.includes(
    status as (typeof distributorPoStatuses)[number],
  )
    ? (status as (typeof distributorPoStatuses)[number])
    : null;
  const moStatusFilter = moStatuses.includes(status as (typeof moStatuses)[number])
    ? (status as (typeof moStatuses)[number])
    : null;
  const shippingStatusFilter = shippingStatuses.includes(
    status as (typeof shippingStatuses)[number],
  )
    ? (status as (typeof shippingStatuses)[number])
    : null;

  const orderWhere: Prisma.PurchaseOrderWhereInput =
    query.length > 0
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            ...(Number.isFinite(queryNumber) ? [{ number: queryNumber }] : []),
          ],
        }
      : {};

  const manufacturingWhere: Prisma.ManufacturingOrderWhereInput =
    query.length > 0
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            ...(Number.isFinite(queryNumber) ? [{ number: queryNumber }] : []),
          ],
        }
      : {};

  const shippingWhere: Prisma.ShippingWhereInput =
    query.length > 0
      ? {
          OR: [
            { trackingNumber: { contains: query, mode: "insensitive" as const } },
            { notes: { contains: query, mode: "insensitive" as const } },
            { logisticsPartner: { name: { contains: query, mode: "insensitive" as const } } },
            ...(looksLikeUuid(query) ? [{ id: query }] : []),
          ],
        }
      : {};

  const poPromise: Promise<Array<{ id: string; number: number; name: string; status: string }>> =
    shouldSearch(args.kind, "po")
      ? prisma.purchaseOrder.findMany({
          where: {
            storeId: context.storeId,
            type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
            ...(poStatusFilter ? { status: poStatusFilter } : {}),
            ...orderWhere,
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
          select: { id: true, number: true, name: true, status: true },
        })
      : Promise.resolve([]);

  const soPromise: Promise<Array<{ id: string; number: number; name: string; status: string }>> =
    shouldSearch(args.kind, "so")
      ? prisma.purchaseOrder.findMany({
          where: {
            storeId: context.storeId,
            type: PURCHASE_ORDER_TYPE_STOCK,
            ...(poStatusFilter ? { status: poStatusFilter } : {}),
            ...orderWhere,
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
          select: { id: true, number: true, name: true, status: true },
        })
      : Promise.resolve([]);

  const moPromise: Promise<Array<{ id: string; number: number; name: string; status: string }>> =
    shouldSearch(args.kind, "mo")
      ? prisma.manufacturingOrder.findMany({
          where: {
            storeId: context.storeId,
            ...(moStatusFilter ? { status: moStatusFilter } : {}),
            ...manufacturingWhere,
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
          select: { id: true, number: true, name: true, status: true },
        })
      : Promise.resolve([]);

  const shippingPromise: Promise<
    Array<{
      id: string;
      status: string;
      type: keyof typeof shippingTypeLabels;
      trackingNumber: string;
      logisticsPartner: { name: string } | null;
    }>
  > = shouldSearch(args.kind, "shipping")
    ? prisma.shipping.findMany({
        where: {
          storeId: context.storeId,
          ...(shippingStatusFilter ? { status: shippingStatusFilter } : {}),
          ...shippingWhere,
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          status: true,
          type: true,
          trackingNumber: true,
          logisticsPartner: { select: { name: true } },
        },
      })
    : Promise.resolve([]);

  const [poRows, soRows, moRows, shippingRows] = await Promise.all([
    poPromise,
    soPromise,
    moPromise,
    shippingPromise,
  ]);

  const mapped = [
    ...poRows.map((order) => ({
      kind: "purchase_order" as const,
      id: order.id,
      label: `PO #${order.number} - ${order.name}`,
      subtitle: distributorPoStatusLabels[order.status] ?? order.status,
      href: `/purchase-orders/${order.id}`,
    })),
    ...soRows.map((order) => ({
      kind: "stock_order" as const,
      id: order.id,
      label: `Stock #${order.number} - ${order.name}`,
      subtitle: distributorPoStatusLabels[order.status] ?? order.status,
      href: `/stock-orders/${order.id}`,
    })),
    ...moRows.map((order) => ({
      kind: "manufacturing_order" as const,
      id: order.id,
      label: `MO #${order.number} - ${order.name}`,
      subtitle: moStatusLabels[order.status] ?? order.status,
      href: `/manufacturing-orders/${order.id}`,
    })),
    ...shippingRows.map((shipping) => ({
      kind: "shipping" as const,
      id: shipping.id,
      label: shipping.trackingNumber,
      subtitle: [
        shippingTypeLabels[shipping.type] ?? shipping.type,
        shippingStatusLabels[shipping.status] ?? shipping.status,
        shipping.logisticsPartner?.name ?? null,
      ]
        .filter(Boolean)
        .join(" - "),
      href: `/shipping?id=${shipping.id}`,
    })),
  ];

  return {
    result: { results: mapped },
    sources: mapped.map((item) => buildSource(item.kind, item.id, item.label, item.href)),
  };
}

function summarizePurchaseOrder(
  row: ReturnType<typeof purchaseOrderDetailFromPrisma>,
  kind: "purchase_order" | "stock_order",
) {
  const totalUnits = row.lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalRevenue = row.lines.reduce(
    (sum, line) => sum + line.quantity * toNumber(line.unitPrice),
    0,
  );
  const totalCost = row.lines.reduce(
    (sum, line) => sum + line.quantity * toNumber(line.unitCost),
    0,
  );

  return {
    found: true,
    order: {
      id: row.id,
      number: row.number,
      name: row.name,
      type: row.type,
      kind,
      status: row.status,
      statusLabel: distributorPoStatusLabels[row.status] ?? row.status,
      saleChannelName: row.saleChannel?.name ?? null,
      invoiceNumber: row.invoice?.invoiceNumber ?? null,
      documentAttached: Boolean(row.documentKey),
      lineCount: row.lines.length,
      totalUnits,
      totalRevenue,
      totalCost,
      grossProfit: totalRevenue - totalCost,
      osdCount: row.osds.length,
      lines: row.lines.slice(0, 12).map((line) => ({
        id: line.id,
        productName: line.product.name,
        sku: line.product.sku,
        quantity: line.quantity,
        orderedQuantity: line.orderedQuantity,
      })),
      linkedManufacturingOrders: row.manufacturingOrderPurchaseOrders.map((link) => ({
        id: link.manufacturingOrder.id,
        number: link.manufacturingOrder.number,
        name: link.manufacturingOrder.name,
        status: link.manufacturingOrder.status,
        statusLabel: moStatusLabels[link.manufacturingOrder.status] ?? link.manufacturingOrder.status,
      })),
      shippings: row.shippings.map((shipping) => ({
        id: shipping.id,
        trackingNumber: shipping.trackingNumber,
        type: shipping.type,
        typeLabel: shippingTypeLabels[shipping.type] ?? shipping.type,
        status: shipping.status,
        statusLabel: shippingStatusLabels[shipping.status] ?? shipping.status,
      })),
      lastStatusChange: row.statusLogs[0]?.createdAt ?? null,
    },
  };
}

async function getPurchaseOrderTool(
  args: z.infer<typeof idArgsSchema>,
  context: AssistantToolContext,
): Promise<ToolExecutionResult> {
  const row = await prisma.purchaseOrder.findFirst({
    where: {
      id: args.id,
      storeId: context.storeId,
      type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
    },
    include: purchaseOrderDetailInclude,
  });

  if (!row) {
    return { result: { found: false, message: "Purchase order not found." }, sources: [] };
  }

  const data = purchaseOrderDetailFromPrisma(row);

  return {
    result: summarizePurchaseOrder(data, "purchase_order"),
    sources: [
      buildSource("purchase_order", data.id, `PO #${data.number} - ${data.name}`, `/purchase-orders/${data.id}`),
    ],
  };
}

async function getStockOrderTool(
  args: z.infer<typeof idArgsSchema>,
  context: AssistantToolContext,
): Promise<ToolExecutionResult> {
  const row = await prisma.purchaseOrder.findFirst({
    where: {
      id: args.id,
      storeId: context.storeId,
      type: PURCHASE_ORDER_TYPE_STOCK,
    },
    include: purchaseOrderDetailInclude,
  });

  if (!row) {
    return { result: { found: false, message: "Stock order not found." }, sources: [] };
  }

  const data = purchaseOrderDetailFromPrisma(row);

  return {
    result: summarizePurchaseOrder(data, "stock_order"),
    sources: [
      buildSource("stock_order", data.id, `Stock #${data.number} - ${data.name}`, `/stock-orders/${data.id}`),
    ],
  };
}

async function getManufacturingOrderTool(
  args: z.infer<typeof idArgsSchema>,
  context: AssistantToolContext,
): Promise<ToolExecutionResult> {
  const row = await prisma.manufacturingOrder.findFirst({
    where: { id: args.id, storeId: context.storeId },
    include: manufacturingOrderDetailInclude,
  });

  if (!row) {
    return { result: { found: false, message: "Manufacturing order not found." }, sources: [] };
  }

  const data = manufacturingOrderDetailFromPrisma(row);
  const verifiedAllocations = data.lineAllocations.filter((line) => line.verified).length;

  return {
    result: {
      found: true,
      order: {
        id: data.id,
        number: data.number,
        name: data.name,
        status: data.status,
        statusLabel: moStatusLabels[data.status] ?? data.status,
        documentAttached: Boolean(data.documentKey),
        manufacturerCount: data.manufacturers.length,
        manufacturers: data.manufacturers.map((manufacturer) => ({
          id: manufacturer.manufacturerId,
          name: manufacturer.manufacturer.name,
          status: manufacturer.status,
          statusLabel: moStatusLabels[manufacturer.status] ?? manufacturer.status,
          invoiceNumber: manufacturer.invoice?.invoiceNumber ?? null,
        })),
        linkedOrders: data.purchaseOrders.map((link) => ({
          id: link.purchaseOrder.id,
          number: link.purchaseOrder.number,
          name: link.purchaseOrder.name,
          type: link.purchaseOrder.type,
          status: link.purchaseOrder.status,
          saleChannelName: link.purchaseOrder.saleChannel?.name ?? null,
        })),
        lineAllocationsSummary: {
          total: data.lineAllocations.length,
          verified: verifiedAllocations,
          unverified: data.lineAllocations.length - verifiedAllocations,
        },
        lineAllocations: data.lineAllocations.slice(0, 12).map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId,
          verified: line.verified,
          manufacturerName: line.manufacturer.name,
          productName: line.purchaseOrderLine.product.name,
          sku: line.purchaseOrderLine.product.sku,
          quantity: line.purchaseOrderLine.quantity,
          orderNumber: line.purchaseOrderLine.purchaseOrder.number,
          orderType: line.purchaseOrderLine.purchaseOrder.type,
        })),
        shippings: data.shippings.map((shipping) => ({
          id: shipping.id,
          trackingNumber: shipping.trackingNumber,
          status: shipping.status,
          statusLabel: shippingStatusLabels[shipping.status] ?? shipping.status,
        })),
        lastStatusChange: data.statusLogs[0]?.createdAt ?? null,
      },
    },
    sources: [
      buildSource(
        "manufacturing_order",
        data.id,
        `MO #${data.number} - ${data.name}`,
        `/manufacturing-orders/${data.id}`,
      ),
    ],
  };
}

async function getShippingTool(
  args: z.infer<typeof idArgsSchema>,
  context: AssistantToolContext,
): Promise<ToolExecutionResult> {
  const row = await prisma.shipping.findFirst({
    where: { id: args.id, storeId: context.storeId },
    include: shippingDetailInclude,
  });

  if (!row) {
    return { result: { found: false, message: "Shipment not found." }, sources: [] };
  }

  const data = shippingRowFromPrisma(row);

  return {
    result: {
      found: true,
      shipping: {
        id: data.id,
        trackingNumber: data.trackingNumber,
        type: data.type,
        typeLabel: shippingTypeLabels[data.type] ?? data.type,
        status: data.status,
        statusLabel: shippingStatusLabels[data.status] ?? data.status,
        cost: data.cost,
        shippedAt: data.shippedAt,
        deliveryDutiesPaid: data.deliveryDutiesPaid,
        partnerName: data.logisticsPartner?.name ?? null,
        trackingLink: data.trackingLink,
        notes: data.notes,
        linkedOrders: data.orders.map((order) => ({
          id: order.id,
          number: order.number,
          name: order.name,
          status: order.status,
          orderType: order.orderType,
        })),
        lastStatusChange: data.statusLogs[0]?.createdAt ?? null,
      },
    },
    sources: [
      buildSource("shipping", data.id, `Shipment ${data.trackingNumber}`, `/shipping?id=${data.id}`),
    ],
  };
}

async function searchMasterDataTool(
  args: z.infer<typeof searchMasterDataArgsSchema>,
  context: AssistantToolContext,
): Promise<ToolExecutionResult> {
  const query = cleanText(args.query);
  const limit = 8;
  const saleChannelTypeQuery =
    query === "distributor" || query === "amazon" || query === "cjdropshipping"
      ? query
      : null;
  const logisticsPartnerTypeQuery =
    query === "freight_forwarder" || query === "carrier" ? query : null;
  const shouldSearch = (target: z.infer<typeof searchMasterDataArgsSchema>["kind"]) =>
    args.kind === "any" || args.kind === target;
  const searches: Array<Promise<Array<AssistantSource & { subtitle?: string }>>> = [];

  if (shouldSearch("product")) {
    searches.push(
      prisma.product
        .findMany({
          where: {
            storeId: context.storeId,
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { sku: { contains: query, mode: "insensitive" } },
            ],
          },
          take: limit,
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            sku: true,
            defaultManufacturer: { select: { name: true } },
          },
        })
        .then((rows) =>
          rows.map((row) => ({
            ...buildSource("product", row.id, `${row.name} (${row.sku})`, `/products?id=${row.id}`),
            subtitle: row.defaultManufacturer.name,
          })),
        ),
    );
  }

  if (shouldSearch("manufacturer")) {
    searches.push(
      prisma.manufacturer
        .findMany({
          where: {
            storeId: context.storeId,
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { region: { contains: query, mode: "insensitive" } },
            ],
          },
          take: limit,
          orderBy: { name: "asc" },
          select: { id: true, name: true, region: true },
        })
        .then((rows) =>
          rows.map((row) => ({
            ...buildSource("manufacturer", row.id, row.name, `/manufacturers?id=${row.id}`),
            subtitle: row.region,
          })),
        ),
    );
  }

  if (shouldSearch("sale_channel")) {
    searches.push(
      prisma.saleChannel
        .findMany({
          where: {
            storeId: context.storeId,
            ...(saleChannelTypeQuery
              ? {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { type: saleChannelTypeQuery },
                  ],
                }
              : { name: { contains: query, mode: "insensitive" } }),
          },
          take: limit,
          orderBy: { name: "asc" },
          select: { id: true, name: true, type: true },
        })
        .then((rows) =>
          rows.map((row) => ({
            ...buildSource("sale_channel", row.id, row.name, `/sale-channels?id=${row.id}`),
            subtitle: row.type,
          })),
        ),
    );
  }

  if (shouldSearch("logistics_partner")) {
    searches.push(
      prisma.logisticsPartner
        .findMany({
          where: {
            storeId: context.storeId,
            ...(logisticsPartnerTypeQuery
              ? {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { type: logisticsPartnerTypeQuery },
                  ],
                }
              : { name: { contains: query, mode: "insensitive" } }),
          },
          take: limit,
          orderBy: { name: "asc" },
          select: { id: true, name: true, type: true },
        })
        .then((rows) =>
          rows.map((row) => ({
            ...buildSource(
              "logistics_partner",
              row.id,
              row.name,
              `/logistics-partners?id=${row.id}`,
            ),
            subtitle: row.type,
          })),
        ),
    );
  }

  const results = (await Promise.all(searches)).flat();

  return {
    result: {
      results: results.map((result) => ({
        kind: result.kind,
        id: result.id,
        label: result.label,
        subtitle: result.subtitle ?? null,
      })),
    },
    sources: results.map((result) => ({
      kind: result.kind,
      id: result.id,
      label: result.label,
      href: result.href,
    })),
  };
}

async function getCurrentPageRecordTool(context: AssistantToolContext): Promise<ToolExecutionResult> {
  const pageContext = context.pageContext;
  if (!pageContext) {
    return {
      result: {
        found: false,
        message: "No supported page context is attached to this request.",
      },
      sources: [],
    };
  }

  if (pageContext.entityType === "po" && pageContext.entityId) {
    return getPurchaseOrderTool({ id: pageContext.entityId }, context);
  }
  if (pageContext.entityType === "so" && pageContext.entityId) {
    return getStockOrderTool({ id: pageContext.entityId }, context);
  }
  if (pageContext.entityType === "mo" && pageContext.entityId) {
    return getManufacturingOrderTool({ id: pageContext.entityId }, context);
  }
  if (pageContext.entityType === "shipping" && pageContext.entityId) {
    return getShippingTool({ id: pageContext.entityId }, context);
  }

  if (pageContext.entityType === "dashboard") {
    const range = buildRangeFromInputs({ from: "", to: "", granularity: "" }, pageContext);
    const dashboard = await getDashboardOverviewTool(
      { from: "", to: "", granularity: "" },
      context,
    );
    return {
      result: {
        found: true,
        page: "dashboard",
        range,
        data: dashboard.result,
      },
      sources: [
        buildSource(
          "dashboard",
          `dashboard:${range.from}:${range.to}:${range.granularity}`,
          `Dashboard (${range.from} to ${range.to})`,
          buildAnalyticsHref(pageContext.pathname || "/", range),
        ),
      ],
    };
  }

  if (pageContext.entityType === "analytics") {
    const range = buildRangeFromInputs({ from: "", to: "", granularity: "" }, pageContext);
    const href = buildAnalyticsHref(pageContext.pathname || "/analytics", range);

    if (pageContext.pathname.startsWith("/analytics/shipping")) {
      return {
        result: {
          found: true,
          page: "analytics-shipping",
          ...(await getShippingAnalyticsSummary(context.storeId, range)),
        },
        sources: [
          buildSource(
            "analytics",
            `analytics:shipping:${range.from}:${range.to}:${range.granularity}`,
            `Shipping analytics (${range.from} to ${range.to})`,
            href,
          ),
        ],
      };
    }

    if (pageContext.pathname.startsWith("/analytics/manufacturing")) {
      return {
        result: {
          found: true,
          page: "analytics-manufacturing",
          ...(await getManufacturingAnalyticsSummary(context.storeId, range)),
        },
        sources: [
          buildSource(
            "analytics",
            `analytics:manufacturing:${range.from}:${range.to}:${range.granularity}`,
            `Manufacturing analytics (${range.from} to ${range.to})`,
            href,
          ),
        ],
      };
    }

    const overview = await getDashboardOverviewTool(
        { from: "", to: "", granularity: "" },
        context,
      );
    return {
        result: {
          found: true,
          page: "analytics-overview",
          data: overview.result,
        },
        sources: [
          buildSource(
            "analytics",
            `analytics:overview:${range.from}:${range.to}:${range.granularity}`,
            `Analytics overview (${range.from} to ${range.to})`,
            href,
          ),
        ],
      };
    }

  return {
    result: {
      found: false,
      message: `Unsupported page context: ${pageContext.pathname}`,
    },
    sources: [],
  };
}

export async function executeAssistantToolCall({
  name,
  rawArguments,
  context,
}: {
  name: string;
  rawArguments: string;
  context: AssistantToolContext;
}): Promise<ToolExecutionResult> {
  switch (name as AssistantToolName) {
    case "get_dashboard_overview": {
      const parsed = parseToolArguments(dashboardArgsSchema, rawArguments);
      if (!parsed.success) {
        return { result: { ok: false, error: "Invalid dashboard arguments." }, sources: [] };
      }
      return getDashboardOverviewTool(parsed.data, context);
    }
    case "get_recent_open_items":
      return getRecentOpenItemsTool(context);
    case "search_orders": {
      const parsed = parseToolArguments(searchOrdersArgsSchema, rawArguments);
      if (!parsed.success) {
        return { result: { ok: false, error: "Invalid search_orders arguments." }, sources: [] };
      }
      return searchOrdersTool(parsed.data, context);
    }
    case "get_purchase_order": {
      const parsed = parseToolArguments(idArgsSchema, rawArguments);
      if (!parsed.success) {
        return { result: { ok: false, error: "Invalid purchase order id." }, sources: [] };
      }
      return getPurchaseOrderTool(parsed.data, context);
    }
    case "get_stock_order": {
      const parsed = parseToolArguments(idArgsSchema, rawArguments);
      if (!parsed.success) {
        return { result: { ok: false, error: "Invalid stock order id." }, sources: [] };
      }
      return getStockOrderTool(parsed.data, context);
    }
    case "get_manufacturing_order": {
      const parsed = parseToolArguments(idArgsSchema, rawArguments);
      if (!parsed.success) {
        return { result: { ok: false, error: "Invalid manufacturing order id." }, sources: [] };
      }
      return getManufacturingOrderTool(parsed.data, context);
    }
    case "get_shipping": {
      const parsed = parseToolArguments(idArgsSchema, rawArguments);
      if (!parsed.success) {
        return { result: { ok: false, error: "Invalid shipment id." }, sources: [] };
      }
      return getShippingTool(parsed.data, context);
    }
    case "search_master_data": {
      const parsed = parseToolArguments(searchMasterDataArgsSchema, rawArguments);
      if (!parsed.success) {
        return { result: { ok: false, error: "Invalid search_master_data arguments." }, sources: [] };
      }
      return searchMasterDataTool(parsed.data, context);
    }
    case "get_current_page_record":
      return getCurrentPageRecordTool(context);
    default:
      return { result: { ok: false, error: `Unknown tool: ${name}` }, sources: [] };
  }
}

export function collectToolSources(results: ToolExecutionResult[]) {
  return dedupeSources(results.flatMap((result) => result.sources));
}
