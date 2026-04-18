import type { PrismaClient } from "@/app/generated/prisma/client";
import type {
  PurchaseOrderOsdResolution,
  PurchaseOrderOsdType,
} from "@/app/generated/prisma/enums";

type OsdRecomputeDb = Pick<PrismaClient, "purchaseOrderLine" | "purchaseOrderOsd">;

/**
 * Signed delta applied to a PO line's effective `quantity` for one OSD line row.
 * `orderedQuantity` is the baseline; `quantity = orderedQuantity + sum(deltas)` per line.
 */
export function osdDelta(
  type: PurchaseOrderOsdType,
  resolution: PurchaseOrderOsdResolution,
  lineQty: number,
): number {
  switch (type) {
    case "overage":
      return resolution === "charged" ? lineQty : 0;
    case "shortage":
      return resolution === "charged" ? -lineQty : 0;
    case "damage":
      return -lineQty;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Recompute `PurchaseOrderLine.quantity` for every line on the PO from
 * `orderedQuantity` + aggregated OSD deltas.
 */
export async function recomputeLineQuantities(
  tx: OsdRecomputeDb,
  purchaseOrderId: string,
  storeId: string,
): Promise<void> {
  const [lines, osdRows] = await Promise.all([
    tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId, storeId },
      select: { id: true, orderedQuantity: true },
    }),
    tx.purchaseOrderOsd.findMany({
      where: { purchaseOrderId, storeId },
      select: {
        type: true,
        resolution: true,
        lines: { select: { purchaseOrderLineId: true, quantity: true } },
      },
    }),
  ]);

  const deltaByLineId = new Map<string, number>();
  for (const osd of osdRows) {
    for (const row of osd.lines) {
      const d = osdDelta(osd.type, osd.resolution, row.quantity);
      deltaByLineId.set(
        row.purchaseOrderLineId,
        (deltaByLineId.get(row.purchaseOrderLineId) ?? 0) + d,
      );
    }
  }

  for (const line of lines) {
    const delta = deltaByLineId.get(line.id) ?? 0;
    const nextQty = line.orderedQuantity + delta;
    if (nextQty < 0) {
      throw new Error("OSD_NEGATIVE_QUANTITY");
    }
    await tx.purchaseOrderLine.update({
      where: { id: line.id },
      data: { quantity: nextQty },
    });
  }
}
