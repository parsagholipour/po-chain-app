import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { warehouseOrderLineCreateSchema } from "@/lib/validations/warehouse-order";
import { warehouseOrderDetailInclude } from "@/lib/warehouse-order-include";
import { warehouseOrderDetailFromPrisma } from "@/lib/shipping-api";
import { assertFulfillmentQuantityAvailable } from "@/lib/fulfillment-quantity";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = warehouseOrderLineCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    await prisma.$transaction(async (tx) => {
      const wo = await tx.warehouseOrder.findFirst({
        where: { id: pid.data.id, storeId },
        select: { id: true, status: true },
      });
      if (!wo) throw new Error("WO_NOT_FOUND");
      if (wo.status !== "open") throw new Error("WO_LOCKED");

      const line = await tx.purchaseOrderLine.findFirst({
        where: { id: parsed.data.purchaseOrderLineId, storeId },
        select: {
          id: true,
          purchaseOrderId: true,
          purchaseOrder: { select: { type: true } },
        },
      });
      if (!line) throw new Error("PURCHASE_ORDER_LINE_NOT_FOUND");
      if (line.purchaseOrder.type !== PURCHASE_ORDER_TYPE_DISTRIBUTOR) {
        throw new Error("PURCHASE_ORDER_TYPE_MISMATCH");
      }

      const linked = await tx.warehouseOrderPurchaseOrder.findFirst({
        where: {
          warehouseOrderId: pid.data.id,
          purchaseOrderId: line.purchaseOrderId,
          storeId,
        },
        select: { warehouseOrderId: true },
      });
      if (!linked) throw new Error("PURCHASE_ORDER_NOT_LINKED");

      await assertFulfillmentQuantityAvailable(tx, {
        storeId,
        purchaseOrderLineId: parsed.data.purchaseOrderLineId,
        quantity: parsed.data.quantity,
      });

      await tx.warehouseOrderPurchaseOrderLine.create({
        data: {
          warehouseOrderId: pid.data.id,
          purchaseOrderLineId: parsed.data.purchaseOrderLineId,
          quantity: parsed.data.quantity,
          storeId,
          createdById: userId,
        },
      });
    });

    const full = await prisma.warehouseOrder.findFirst({
      where: { id: pid.data.id, storeId },
      include: warehouseOrderDetailInclude,
    });
    return NextResponse.json(full ? warehouseOrderDetailFromPrisma(full) : null, {
      status: 201,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "WO_NOT_FOUND") {
      return jsonError("Warehouse order not found", 404);
    }
    if (e instanceof Error && e.message === "WO_LOCKED") {
      return jsonError("Warehouse order lines can only be changed while open", 409);
    }
    if (e instanceof Error && e.message === "PURCHASE_ORDER_LINE_NOT_FOUND") {
      return jsonError("Purchase order line not found", 404);
    }
    if (e instanceof Error && e.message === "PURCHASE_ORDER_TYPE_MISMATCH") {
      return jsonError("Warehouse orders can only allocate distributor purchase order lines", 400);
    }
    if (e instanceof Error && e.message === "PURCHASE_ORDER_NOT_LINKED") {
      return jsonError("Purchase order line is not on a purchase order linked to this WO", 400);
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
