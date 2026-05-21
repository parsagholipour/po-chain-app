import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { warehouseOrderDetailInclude } from "@/lib/warehouse-order-include";
import { warehouseOrderDetailFromPrisma } from "@/lib/shipping-api";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ purchaseOrderId: z.uuid() });

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    await prisma.$transaction(async (tx) => {
      const wo = await tx.warehouseOrder.findFirst({
        where: { id: pid.data.id, storeId },
        select: { id: true, status: true },
      });
      if (!wo) throw new Error("WO_NOT_FOUND");
      if (wo.status !== "open") throw new Error("WO_LOCKED");

      const po = await tx.purchaseOrder.findFirst({
        where: {
          id: parsed.data.purchaseOrderId,
          storeId,
          type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
          isBackOrder: false,
        },
        select: { id: true },
      });
      if (!po) throw new Error("PO_NOT_FOUND");

      await tx.warehouseOrderPurchaseOrder.create({
        data: {
          warehouseOrderId: pid.data.id,
          purchaseOrderId: parsed.data.purchaseOrderId,
          storeId,
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
      return jsonError("Warehouse order lines and links can only be changed while open", 409);
    }
    if (e instanceof Error && e.message === "PO_NOT_FOUND") {
      return jsonError("Distributor purchase order not found", 404);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
