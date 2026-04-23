import type { PrismaClient } from "@/app/generated/prisma/client";

type ShippingStatusSyncDb = Pick<PrismaClient, "manufacturingOrder" | "purchaseOrder">;

const ACTIVE_SHIPPING_STATUSES: Array<"in_transit" | "delivered"> = [
  "in_transit",
  "delivered",
];

function uniqueIds(ids: string[] | undefined) {
  return [...new Set(ids ?? [])];
}

export async function reconcileLinkedOrderStatusesForShipping(
  db: ShippingStatusSyncDb,
  {
    storeId,
    manufacturingOrderIds,
    purchaseOrderIds,
  }: {
    storeId: string;
    manufacturingOrderIds?: string[];
    purchaseOrderIds?: string[];
  },
) {
  const normalizedManufacturingOrderIds = uniqueIds(manufacturingOrderIds);
  const normalizedPurchaseOrderIds = uniqueIds(purchaseOrderIds);

  if (normalizedManufacturingOrderIds.length > 0) {
    const manufacturingOrders = await db.manufacturingOrder.findMany({
      where: {
        id: { in: normalizedManufacturingOrderIds },
        storeId,
      },
      select: {
        id: true,
        status: true,
        manufacturingOrderShippings: {
          where: {
            storeId,
            shipping: { status: { in: ACTIVE_SHIPPING_STATUSES } },
          },
          select: { shippingId: true },
          take: 1,
        },
      },
    });

    const shippedIds: string[] = [];
    const readyToShipIds: string[] = [];

    for (const order of manufacturingOrders) {
      const hasActiveShipping = order.manufacturingOrderShippings.length > 0;
      if (hasActiveShipping && (order.status === "open" || order.status === "ready_to_ship")) {
        shippedIds.push(order.id);
      }
      if (!hasActiveShipping && order.status === "shipped") {
        readyToShipIds.push(order.id);
      }
    }

    if (shippedIds.length > 0) {
      await db.manufacturingOrder.updateMany({
        where: {
          id: { in: shippedIds },
          storeId,
          status: { in: ["open", "ready_to_ship"] },
        },
        data: { status: "shipped" },
      });
    }

    if (readyToShipIds.length > 0) {
      await db.manufacturingOrder.updateMany({
        where: {
          id: { in: readyToShipIds },
          storeId,
          status: "shipped",
        },
        data: { status: "ready_to_ship" },
      });
    }
  }

  if (normalizedPurchaseOrderIds.length > 0) {
    const purchaseOrders = await db.purchaseOrder.findMany({
      where: {
        id: { in: normalizedPurchaseOrderIds },
        storeId,
      },
      select: {
        id: true,
        status: true,
        purchaseOrderShippings: {
          where: {
            storeId,
            shipping: { status: { in: ACTIVE_SHIPPING_STATUSES } },
          },
          select: { shippingId: true },
          take: 1,
        },
      },
    });

    const inTransitIds: string[] = [];
    const openIds: string[] = [];

    for (const order of purchaseOrders) {
      const hasActiveShipping = order.purchaseOrderShippings.length > 0;
      if (hasActiveShipping && order.status === "open") {
        inTransitIds.push(order.id);
      }
      if (!hasActiveShipping && order.status === "in_transit") {
        openIds.push(order.id);
      }
    }

    if (inTransitIds.length > 0) {
      // PO/SO still store `in_transit`; UI now shows that value as "Shipped".
      await db.purchaseOrder.updateMany({
        where: {
          id: { in: inTransitIds },
          storeId,
          status: "open",
        },
        data: { status: "in_transit" },
      });
    }

    if (openIds.length > 0) {
      await db.purchaseOrder.updateMany({
        where: {
          id: { in: openIds },
          storeId,
          status: "in_transit",
        },
        data: { status: "open" },
      });
    }
  }
}
