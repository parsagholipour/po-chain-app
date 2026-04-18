import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { purchaseOrderLinePatchSchema } from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { requireStoreContext } from "@/lib/store-context";
import { productPricingSnapshot } from "@/lib/purchase-order-line-pricing";
import { purchaseOrderLineApiInclude } from "@/lib/purchase-order-include";
import { purchaseOrderLineFromPrisma } from "@/lib/shipping-api";
import { recomputeLineQuantities } from "@/lib/po/osd-recompute";

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
        type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
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

  const { quantity, ...restPatch } = parsed.data;

  try {
    const line = await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderLine.update({
        where: { id: pid.data.lineId },
        data: {
          ...restPatch,
          ...(pricingSnapshot ?? {}),
          ...(quantity !== undefined ? { orderedQuantity: quantity } : {}),
        },
      });
      try {
        await recomputeLineQuantities(tx, pid.data.id, storeId);
      } catch (e) {
        if (e instanceof Error && e.message === "OSD_NEGATIVE_QUANTITY") {
          throw new Error("OSD_NEGATIVE_QUANTITY");
        }
        throw e;
      }
      return tx.purchaseOrderLine.findFirstOrThrow({
        where: { id: pid.data.lineId },
        include: purchaseOrderLineApiInclude,
      });
    });
    return NextResponse.json(purchaseOrderLineFromPrisma(line));
  } catch (e) {
    if (e instanceof Error && e.message === "OSD_NEGATIVE_QUANTITY") {
      return jsonError("Effective quantity would become negative for one or more lines", 400);
    }
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
        type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
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
