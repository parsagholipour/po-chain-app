import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { moLineAllocationCreateSchema } from "@/lib/validations/manufacturing-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";
import {
  manufacturerOnManufacturingOrder,
  purchaseOrderLineLinkedToMo,
} from "@/lib/mo-line-guard";
import { manufacturingOrderDetailFromPrisma } from "@/lib/shipping-api";
import { requireStoreContext } from "@/lib/store-context";

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

  const parsed = moLineAllocationCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const mo = await prisma.manufacturingOrder.findFirst({
    where: { id: pid.data.id, storeId },
  });
  if (!mo) return jsonError("Manufacturing order not found", 404);

  const linked = await purchaseOrderLineLinkedToMo(
    storeId,
    pid.data.id,
    parsed.data.purchaseOrderLineId,
  );
  if (!linked) {
    return jsonError("Purchase order line is not on a purchase order linked to this MO", 400);
  }

  const onMo = await manufacturerOnManufacturingOrder(
    storeId,
    pid.data.id,
    parsed.data.manufacturerId,
  );
  if (!onMo) {
    return jsonError("Manufacturer is not linked to this manufacturing order", 400);
  }

  const existingLine = await prisma.purchaseOrderLine.findFirst({
    where: { id: parsed.data.purchaseOrderLineId, storeId },
  });
  if (!existingLine) return jsonError("Purchase order line not found", 404);

  try {
    await prisma.manufacturingOrderPurchaseOrderLine.create({
      data: {
        manufacturingOrderId: pid.data.id,
        purchaseOrderLineId: parsed.data.purchaseOrderLineId,
        manufacturerId: parsed.data.manufacturerId,
        verified: parsed.data.verified ?? false,
        storeId,
        createdById: userId,
      },
    });

    const full = await prisma.manufacturingOrder.findFirst({
      where: { id: pid.data.id, storeId },
      include: manufacturingOrderDetailInclude,
    });
    return NextResponse.json(full ? manufacturingOrderDetailFromPrisma(full) : null, {
      status: 201,
    });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
