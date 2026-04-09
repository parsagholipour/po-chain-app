import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { stockOrderPatchSchema } from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { purchaseOrderDetailInclude } from "@/lib/purchase-order-include";
import { PURCHASE_ORDER_TYPE_STOCK } from "@/lib/purchase-order-type";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const row = await prisma.purchaseOrder.findFirst({
    where: { id: pid.data.id, type: PURCHASE_ORDER_TYPE_STOCK },
    include: purchaseOrderDetailInclude,
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(row);
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = stockOrderPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  try {
    const existing = await prisma.purchaseOrder.findFirst({
      where: { id: pid.data.id, type: PURCHASE_ORDER_TYPE_STOCK },
      select: { id: true },
    });
    if (!existing) {
      return jsonError("Not found", 404);
    }

    await prisma.purchaseOrder.update({
      where: { id: pid.data.id },
      data: parsed.data,
    });

    const row = await prisma.purchaseOrder.findFirst({
      where: { id: pid.data.id, type: PURCHASE_ORDER_TYPE_STOCK },
      include: purchaseOrderDetailInclude,
    });
    return NextResponse.json(row);
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  try {
    const deleted = await prisma.purchaseOrder.deleteMany({
      where: { id: pid.data.id, type: PURCHASE_ORDER_TYPE_STOCK },
    });
    if (deleted.count === 0) return jsonError("Not found", 404);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
