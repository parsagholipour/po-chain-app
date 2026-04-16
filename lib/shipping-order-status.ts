type ShippingStatusSyncDb = {
  manufacturingOrder: {
    updateMany(args: {
      where: {
        id: { in: string[] };
        storeId: string;
        status: { in: Array<"open" | "ready_to_ship"> };
      };
      data: { status: "shipped" };
    }): Promise<unknown>;
  };
  purchaseOrder: {
    updateMany(args: {
      where: { id: { in: string[] }; storeId: string; status: "open" };
      data: { status: "in_transit" };
    }): Promise<unknown>;
  };
};

function uniqueIds(ids: string[] | undefined) {
  return [...new Set(ids ?? [])];
}

export async function syncLinkedOrderStatusesForShipping(
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
    await db.manufacturingOrder.updateMany({
      where: {
        id: { in: normalizedManufacturingOrderIds },
        storeId,
        status: { in: ["open", "ready_to_ship"] },
      },
      data: { status: "shipped" },
    });
  }

  if (normalizedPurchaseOrderIds.length > 0) {
    // PO still stores `in_transit`; UI now shows that value as "Shipped".
    await db.purchaseOrder.updateMany({
      where: {
        id: { in: normalizedPurchaseOrderIds },
        storeId,
        status: "open",
      },
      data: { status: "in_transit" },
    });
  }
}
