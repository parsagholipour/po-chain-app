import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";
import { warehouseOrderLinePatchSchema } from "@/lib/validations/warehouse-order";
import { warehouseOrderDetailInclude } from "@/lib/warehouse-order-include";
import { warehouseOrderDetailFromPrisma } from "@/lib/shipping-api";
import { assertFulfillmentQuantityAvailable } from "@/lib/fulfillment-quantity";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
  purchaseOrderLineId: z.uuid(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; purchaseOrderLineId: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = warehouseOrderLinePatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const wo = await tx.warehouseOrder.findFirst({
        where: { id: pid.data.id, storeId },
        select: { id: true, status: true },
      });
      if (!wo) throw new Error("WO_NOT_FOUND");
      if (wo.status !== "open") throw new Error("WO_LOCKED");

      const existing = await tx.warehouseOrderPurchaseOrderLine.findFirst({
        where: {
          warehouseOrderId: pid.data.id,
          purchaseOrderLineId: pid.data.purchaseOrderLineId,
          storeId,
        },
        select: { purchaseOrderLineId: true },
      });
      if (!existing) throw new Error("LINE_NOT_FOUND");

      if (parsed.data.quantity !== undefined) {
        await assertFulfillmentQuantityAvailable(tx, {
          storeId,
          purchaseOrderLineId: pid.data.purchaseOrderLineId,
          quantity: parsed.data.quantity,
          excludeWarehouseOrderId: pid.data.id,
        });
      }

      await tx.warehouseOrderPurchaseOrderLine.update({
        where: {
          warehouseOrderId_purchaseOrderLineId: {
            warehouseOrderId: pid.data.id,
            purchaseOrderLineId: pid.data.purchaseOrderLineId,
          },
        },
        data: parsed.data,
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
      return jsonError("Warehouse order lines can only be changed while open", 409);
    }
    if (e instanceof Error && e.message === "LINE_NOT_FOUND") {
      return jsonError("Line allocation not found", 404);
    }
    if (e instanceof Error && e.message.startsWith("FULFILLMENT_QUANTITY_EXCEEDED:")) {
      const available = e.message.slice("FULFILLMENT_QUANTITY_EXCEEDED:".length);
      return jsonError(`Requested quantity exceeds available fulfillment quantity (${available})`, 409);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; purchaseOrderLineId: string }> },
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

      const deleted = await tx.warehouseOrderPurchaseOrderLine.deleteMany({
        where: {
          warehouseOrderId: pid.data.id,
          purchaseOrderLineId: pid.data.purchaseOrderLineId,
          storeId,
        },
      });
      if (deleted.count === 0) throw new Error("LINE_NOT_FOUND");
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
      return jsonError("Warehouse order lines can only be changed while open", 409);
    }
    if (e instanceof Error && e.message === "LINE_NOT_FOUND") {
      return jsonError("Line allocation not found", 404);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
