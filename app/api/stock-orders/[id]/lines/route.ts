import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { purchaseOrderLineCreateSchema } from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
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

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: pid.data.id, type: PURCHASE_ORDER_TYPE_STOCK },
  });
  if (!po) return jsonError("Stock order not found", 404);

  const lines = await prisma.purchaseOrderLine.findMany({
    where: { purchaseOrderId: pid.data.id },
    include: { product: { include: { defaultManufacturer: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(lines);
}

export async function POST(
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

  const parsed = purchaseOrderLineCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: pid.data.id, type: PURCHASE_ORDER_TYPE_STOCK },
  });
  if (!po) return jsonError("Stock order not found", 404);

  const product = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
  if (!product) return jsonError("Product not found", 404);

  try {
    const line = await prisma.purchaseOrderLine.create({
      data: {
        purchaseOrderId: pid.data.id,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        createdById: userId,
      },
      include: { product: { include: { defaultManufacturer: true } } },
    });
    return NextResponse.json(line, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
