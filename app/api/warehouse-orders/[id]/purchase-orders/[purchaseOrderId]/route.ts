import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";
import { warehouseOrderDetailInclude } from "@/lib/warehouse-order-include";
import { warehouseOrderDetailFromPrisma } from "@/lib/shipping-api";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
  purchaseOrderId: z.uuid(),
});

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; purchaseOrderId: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);

  try {
    await prisma.$transaction(async (tx) => {
      const wo = await tx.warehouseOrder.findFirst({
        where: { id: pid.data.id, storeId },
        select: { id: true, status: true },
      });
      if (!wo) throw new Error("WO_NOT_FOUND");
      if (wo.status !== "open") throw new Error("WO_LOCKED");

      const link = await tx.warehouseOrderPurchaseOrder.findFirst({
        where: {
          warehouseOrderId: pid.data.id,
          purchaseOrderId: pid.data.purchaseOrderId,
          storeId,
        },
        select: { warehouseOrderId: true },
      });
      if (!link) throw new Error("PO_LINK_NOT_FOUND");

      const lineRows = await tx.warehouseOrderPurchaseOrderLine.findMany({
        where: { warehouseOrderId: pid.data.id, storeId },
        select: {
          purchaseOrderLineId: true,
          purchaseOrderLine: { select: { purchaseOrderId: true } },
        },
      });
      const lineIdsToRemove = lineRows
        .filter((row) => row.purchaseOrderLine.purchaseOrderId === pid.data.purchaseOrderId)
        .map((row) => row.purchaseOrderLineId);

      if (lineIdsToRemove.length > 0) {
        await tx.warehouseOrderPurchaseOrderLine.deleteMany({
          where: {
            warehouseOrderId: pid.data.id,
            purchaseOrderLineId: { in: lineIdsToRemove },
            storeId,
          },
        });
      }

      await tx.warehouseOrderPurchaseOrder.deleteMany({
        where: {
          warehouseOrderId: pid.data.id,
          purchaseOrderId: pid.data.purchaseOrderId,
          storeId,
        },
      });
    });

    const full = await prisma.warehouseOrder.findFirst({
      where: { id: pid.data.id, storeId },
      include: warehouseOrderDetailInclude,
    });
    return NextResponse.json(full ? warehouseOrderDetailFromPrisma(full) : null);
  } catch (e) {
    if (e instanceof Error && e.message === "WO_NOT_FOUND") {
      return jsonError("Warehouse order not found", 404);
    }
    if (e instanceof Error && e.message === "WO_LOCKED") {
      return jsonError("Warehouse order lines and links can only be changed while open", 409);
    }
    if (e instanceof Error && e.message === "PO_LINK_NOT_FOUND") {
      return jsonError("Purchase order link not found", 404);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
