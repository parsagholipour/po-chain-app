import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { purchaseOrderLineCreateSchema } from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { requireStoreContext } from "@/lib/store-context";
import { productPricingSnapshot } from "@/lib/purchase-order-line-pricing";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const po = await prisma.purchaseOrder.findFirst({
    where: {
      id: pid.data.id,
      storeId,
      type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
    },
  });
  if (!po) return jsonError("Purchase order not found", 404);

  const lines = await prisma.purchaseOrderLine.findMany({
    where: { purchaseOrderId: pid.data.id, storeId },
    include: { product: { include: { defaultManufacturer: true, category: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(lines);
}

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

  const parsed = purchaseOrderLineCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const po = await prisma.purchaseOrder.findFirst({
    where: {
      id: pid.data.id,
      storeId,
      type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
    },
  });
  if (!po) return jsonError("Purchase order not found", 404);

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, storeId },
  });
  if (!product) return jsonError("Product not found", 404);

  try {
    const line = await prisma.purchaseOrderLine.create({
      data: {
        purchaseOrderId: pid.data.id,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        ...productPricingSnapshot(product),
        storeId,
        createdById: userId,
      },
      include: { product: { include: { defaultManufacturer: true, category: true } } },
    });
    return NextResponse.json(line, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
