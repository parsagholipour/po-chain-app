import { prisma } from "@/lib/prisma";

/** True if the PO that owns `purchaseOrderLineId` is linked to this manufacturing order. */
export async function purchaseOrderLineLinkedToMo(
  manufacturingOrderId: string,
  purchaseOrderLineId: string,
): Promise<boolean> {
  const line = await prisma.purchaseOrderLine.findUnique({
    where: { id: purchaseOrderLineId },
    select: { purchaseOrderId: true },
  });
  if (!line) return false;
  const link = await prisma.manufacturingOrderPurchaseOrder.findUnique({
    where: {
      manufacturingOrderId_purchaseOrderId: {
        manufacturingOrderId,
        purchaseOrderId: line.purchaseOrderId,
      },
    },
  });
  return !!link;
}

/** True if `manufacturerId` is on the manufacturing order manufacturer pivot. */
export async function manufacturerOnManufacturingOrder(
  manufacturingOrderId: string,
  manufacturerId: string,
): Promise<boolean> {
  const row = await prisma.manufacturingOrderManufacturer.findUnique({
    where: {
      manufacturingOrderId_manufacturerId: { manufacturingOrderId, manufacturerId },
    },
  });
  return !!row;
}
