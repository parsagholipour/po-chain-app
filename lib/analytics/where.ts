import type { Prisma } from "@/app/generated/prisma/client";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR, PURCHASE_ORDER_TYPE_STOCK } from "@/lib/purchase-order-type";
import type { AnalyticsRange } from "@/lib/types/analytics";
import { toEndOfDay, toStartOfDay } from "@/lib/analytics/date-range";

export function closedDistributorPoWhere(storeId: string, range: AnalyticsRange): Prisma.PurchaseOrderWhereInput {
  return {
    storeId,
    type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
    status: "closed",
    updatedAt: {
      gte: toStartOfDay(range.from),
      lte: toEndOfDay(range.to),
    },
  };
}

export function closedStockOrderWhere(storeId: string, range: AnalyticsRange): Prisma.PurchaseOrderWhereInput {
  return {
    storeId,
    type: PURCHASE_ORDER_TYPE_STOCK,
    status: "closed",
    updatedAt: {
      gte: toStartOfDay(range.from),
      lte: toEndOfDay(range.to),
    },
  };
}

export function shippingDateWhere(range: AnalyticsRange): Prisma.ShippingWhereInput {
  return {
    OR: [
      {
        shippedAt: {
          gte: toStartOfDay(range.from),
          lte: toEndOfDay(range.to),
        },
      },
      {
        shippedAt: null,
        createdAt: {
          gte: toStartOfDay(range.from),
          lte: toEndOfDay(range.to),
        },
      },
    ],
  };
}
