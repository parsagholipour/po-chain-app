import type { PrismaClient } from "@/app/generated/prisma/client";

type OsdMoDb = Pick<
  PrismaClient,
  | "purchaseOrderLine"
  | "manufacturingOrderPurchaseOrderLine"
  | "manufacturingOrderPurchaseOrder"
  | "manufacturingOrderManufacturer"
>;

export type OsdMoValidationResult =
  | { ok: true }
  | { ok: false; message: string; field?: string };

/**
 * Validates manufacturing order attribution for an OSD payload.
 * See plan: MO required when every selected PO line has an MO allocation.
 */
export async function validateOsdMoContext(
  tx: OsdMoDb,
  params: {
    storeId: string;
    purchaseOrderId: string;
    manufacturingOrderId: string | null;
    purchaseOrderLineIds: string[];
  },
): Promise<OsdMoValidationResult> {
  const { storeId, purchaseOrderId, manufacturingOrderId, purchaseOrderLineIds } =
    params;

  const uniqueLineIds = [...new Set(purchaseOrderLineIds)];
  if (uniqueLineIds.length === 0) {
    return { ok: false, message: "At least one line is required", field: "lines" };
  }

  const lines = await tx.purchaseOrderLine.findMany({
    where: { id: { in: uniqueLineIds }, purchaseOrderId, storeId },
    select: { id: true },
  });
  if (lines.length !== uniqueLineIds.length) {
    return {
      ok: false,
      message: "One or more lines do not belong to this purchase order",
      field: "lines",
    };
  }

  const allocations = await tx.manufacturingOrderPurchaseOrderLine.findMany({
    where: { purchaseOrderLineId: { in: uniqueLineIds }, storeId },
    select: {
      purchaseOrderLineId: true,
      manufacturingOrderId: true,
    },
  });

  const lineHasAnyAllocation = new Set(allocations.map((a) => a.purchaseOrderLineId));
  const allLinesAllocated = uniqueLineIds.every((id) => lineHasAnyAllocation.has(id));

  if (allLinesAllocated && !manufacturingOrderId) {
    return {
      ok: false,
      message:
        "Manufacturing order is required when every selected line is allocated to a manufacturing order",
      field: "manufacturingOrderId",
    };
  }

  if (!manufacturingOrderId) {
    return { ok: true };
  }

  const link = await tx.manufacturingOrderPurchaseOrder.findFirst({
    where: { purchaseOrderId, manufacturingOrderId, storeId },
    select: { manufacturingOrderId: true },
  });
  if (!link) {
    return {
      ok: false,
      message: "Manufacturing order is not linked to this purchase order",
      field: "manufacturingOrderId",
    };
  }

  for (const lineId of uniqueLineIds) {
    const alloc = allocations.find(
      (a) =>
        a.manufacturingOrderId === manufacturingOrderId &&
        a.purchaseOrderLineId === lineId,
    );
    if (!alloc) {
      return {
        ok: false,
        message: "Each selected line must be allocated to the selected manufacturing order",
        field: "manufacturingOrderId",
      };
    }
  }

  return { ok: true };
}
