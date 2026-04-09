import { prisma } from "@/lib/prisma";

/** True if the PO line's purchase order is linked to the manufacturing order. */
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
