import { prisma } from "@/lib/prisma";

/** True if the PO that owns `purchaseOrderLineId` is linked to this manufacturing order. */
export async function purchaseOrderLineLinkedToMo(
  storeId: string,
  manufacturingOrderId: string,
  purchaseOrderLineId: string,
): Promise<boolean> {
  const line = await prisma.purchaseOrderLine.findFirst({
    where: { id: purchaseOrderLineId, storeId },
    select: { purchaseOrderId: true },
  });
  if (!line) return false;
  const link = await prisma.manufacturingOrderPurchaseOrder.findFirst({
    where: {
      storeId,
      manufacturingOrderId,
      purchaseOrderId: line.purchaseOrderId,
    },
  });
  return !!link;
}

/** True if `manufacturerId` is on the manufacturing order manufacturer pivot. */
export async function manufacturerOnManufacturingOrder(
  storeId: string,
  manufacturingOrderId: string,
  manufacturerId: string,
): Promise<boolean> {
  const row = await prisma.manufacturingOrderManufacturer.findFirst({
    where: {
      storeId,
      manufacturingOrderId,
      manufacturerId,
    },
  });
  return !!row;
}
