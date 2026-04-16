import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { purchaseOrderLinePatchSchema } from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { PURCHASE_ORDER_TYPE_STOCK } from "@/lib/purchase-order-type";
import { requireStoreContext } from "@/lib/store-context";
import { productPricingSnapshot } from "@/lib/purchase-order-line-pricing";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
  lineId: z.uuid(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; lineId: string }> },
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

  const parsed = purchaseOrderLinePatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const existing = await prisma.purchaseOrderLine.findFirst({
    where: {
      id: pid.data.lineId,
      storeId,
      purchaseOrderId: pid.data.id,
      purchaseOrder: {
        storeId,
        type: PURCHASE_ORDER_TYPE_STOCK,
      },
    },
  });
  if (!existing) return jsonError("Line not found", 404);

  let pricingSnapshot: ReturnType<typeof productPricingSnapshot> | null = null;
  if (parsed.data.productId !== undefined) {
    const product = await prisma.product.findFirst({
      where: { id: parsed.data.productId, storeId },
    });
    if (!product) return jsonError("Product not found", 404);
    pricingSnapshot = productPricingSnapshot(product);
  }

  try {
    const line = await prisma.purchaseOrderLine.update({
      where: { id: pid.data.lineId },
      data: { ...parsed.data, ...(pricingSnapshot ?? {}) },
      include: { product: { include: { defaultManufacturer: true, category: true } } },
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
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);

  const existing = await prisma.purchaseOrderLine.findFirst({
    where: {
      id: pid.data.lineId,
      storeId,
      purchaseOrderId: pid.data.id,
      purchaseOrder: {
        storeId,
        type: PURCHASE_ORDER_TYPE_STOCK,
      },
    },
  });
  if (!existing) return jsonError("Line not found", 404);

  try {
    await prisma.purchaseOrderLine.deleteMany({
      where: { id: pid.data.lineId, storeId },
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
