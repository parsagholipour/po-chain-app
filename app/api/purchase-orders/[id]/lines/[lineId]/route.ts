import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { purchaseOrderLinePatchSchema } from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
  lineId: z.uuid(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; lineId: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = purchaseOrderLinePatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const existing = await prisma.purchaseOrderLine.findFirst({
    where: {
      id: pid.data.lineId,
      purchaseOrderId: pid.data.id,
      purchaseOrder: { type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
    },
  });
  if (!existing) return jsonError("Line not found", 404);

  if (parsed.data.productId !== undefined) {
    const product = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
    if (!product) return jsonError("Product not found", 404);
  }

  try {
    const line = await prisma.purchaseOrderLine.update({
      where: { id: pid.data.lineId },
      data: parsed.data,
      include: { product: { include: { defaultManufacturer: true } } },
    });
    return NextResponse.json(line);
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; lineId: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);

  const existing = await prisma.purchaseOrderLine.findFirst({
    where: {
      id: pid.data.lineId,
      purchaseOrderId: pid.data.id,
      purchaseOrder: { type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
    },
  });
  if (!existing) return jsonError("Line not found", 404);

  try {
    await prisma.purchaseOrderLine.delete({ where: { id: pid.data.lineId } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
