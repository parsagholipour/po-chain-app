import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { moLineAllocationPatchSchema } from "@/lib/validations/manufacturing-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";
import { manufacturerOnManufacturingOrder } from "@/lib/mo-line-guard";
import { manufacturingOrderDetailFromPrisma } from "@/lib/shipping-api";
import { requireStoreContext } from "@/lib/store-context";

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

  const parsed = moLineAllocationPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const existing = await prisma.manufacturingOrderPurchaseOrderLine.findFirst({
    where: {
      manufacturingOrderId: pid.data.id,
      purchaseOrderLineId: pid.data.purchaseOrderLineId,
      storeId,
    },
  });
  if (!existing) return jsonError("Line allocation not found", 404);

  if (parsed.data.manufacturerId !== undefined) {
    const onMo = await manufacturerOnManufacturingOrder(
      storeId,
      pid.data.id,
      parsed.data.manufacturerId,
    );
    if (!onMo) {
      return jsonError("Manufacturer is not linked to this manufacturing order", 400);
    }
  }

  try {
    await prisma.manufacturingOrderPurchaseOrderLine.update({
      where: {
        manufacturingOrderId_purchaseOrderLineId: {
          manufacturingOrderId: pid.data.id,
          purchaseOrderLineId: pid.data.purchaseOrderLineId,
        },
      },
      data: parsed.data,
    });

    const full = await prisma.manufacturingOrder.findFirst({
      where: { id: pid.data.id, storeId },
      include: manufacturingOrderDetailInclude,
    });
    return NextResponse.json(full ? manufacturingOrderDetailFromPrisma(full) : null);
  } catch (e) {
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

  const existing = await prisma.manufacturingOrderPurchaseOrderLine.findFirst({
    where: {
      manufacturingOrderId: pid.data.id,
      purchaseOrderLineId: pid.data.purchaseOrderLineId,
      storeId,
    },
  });
  if (!existing) return jsonError("Line allocation not found", 404);

  try {
    await prisma.manufacturingOrderPurchaseOrderLine.delete({
      where: {
        manufacturingOrderId_purchaseOrderLineId: {
          manufacturingOrderId: pid.data.id,
          purchaseOrderLineId: pid.data.purchaseOrderLineId,
        },
      },
    });

    const full = await prisma.manufacturingOrder.findFirst({
      where: { id: pid.data.id, storeId },
      include: manufacturingOrderDetailInclude,
    });
    return NextResponse.json(full ? manufacturingOrderDetailFromPrisma(full) : null);
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
