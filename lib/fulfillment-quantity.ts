import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

type FulfillmentQuantityDb = Pick<
  Prisma.TransactionClient,
  | "purchaseOrderLine"
  | "manufacturingOrderPurchaseOrderLine"
  | "warehouseOrderPurchaseOrderLine"
>;

export type FulfillmentAvailability = {
  purchaseOrderLineId: string;
  purchaseOrderId: string;
  lineQuantity: number;
  manufacturingAllocatedQuantity: number;
  warehouseAllocatedQuantity: number;
  allocatedQuantity: number;
  availableQuantity: number;
};

export async function getFulfillmentAvailability(
  db: FulfillmentQuantityDb,
  {
    storeId,
    purchaseOrderLineId,
    excludeManufacturingOrderId,
    excludeWarehouseOrderId,
  }: {
    storeId: string;
    purchaseOrderLineId: string;
    excludeManufacturingOrderId?: string;
    excludeWarehouseOrderId?: string;
  },
): Promise<FulfillmentAvailability | null> {
  const line = await db.purchaseOrderLine.findFirst({
    where: { id: purchaseOrderLineId, storeId },
    select: {
      id: true,
      purchaseOrderId: true,
      quantity: true,
    },
  });
  if (!line) return null;

  const [manufacturingAllocations, warehouseAllocations] = await Promise.all([
    db.manufacturingOrderPurchaseOrderLine.findMany({
      where: {
        storeId,
        purchaseOrderLineId,
        ...(excludeManufacturingOrderId
          ? { NOT: { manufacturingOrderId: excludeManufacturingOrderId } }
          : {}),
      },
      select: { quantity: true },
    }),
    db.warehouseOrderPurchaseOrderLine.findMany({
      where: {
        storeId,
        purchaseOrderLineId,
        ...(excludeWarehouseOrderId
          ? { NOT: { warehouseOrderId: excludeWarehouseOrderId } }
          : {}),
      },
      select: { quantity: true },
    }),
  ]);

  const manufacturingAllocatedQuantity = manufacturingAllocations.reduce(
    (sum, row) => sum + row.quantity,
    0,
  );
  const warehouseAllocatedQuantity = warehouseAllocations.reduce(
    (sum, row) => sum + row.quantity,
    0,
  );
  const allocatedQuantity = manufacturingAllocatedQuantity + warehouseAllocatedQuantity;
  const availableQuantity = Math.max(0, line.quantity - allocatedQuantity);

  return {
    purchaseOrderLineId: line.id,
    purchaseOrderId: line.purchaseOrderId,
    lineQuantity: line.quantity,
    manufacturingAllocatedQuantity,
    warehouseAllocatedQuantity,
    allocatedQuantity,
    availableQuantity,
  };
}

export async function assertFulfillmentQuantityAvailable(
  db: FulfillmentQuantityDb,
  params: {
    storeId: string;
    purchaseOrderLineId: string;
    quantity: number;
    excludeManufacturingOrderId?: string;
    excludeWarehouseOrderId?: string;
  },
): Promise<FulfillmentAvailability> {
  const availability = await getFulfillmentAvailability(db, params);
  if (!availability) {
    throw new Error("PURCHASE_ORDER_LINE_NOT_FOUND");
  }
  if (params.quantity > availability.availableQuantity) {
    throw new Error(`FULFILLMENT_QUANTITY_EXCEEDED:${availability.availableQuantity}`);
  }
  return availability;
}
