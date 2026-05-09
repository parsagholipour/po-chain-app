import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { purchaseOrderLineCreateSchema } from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import {
  distributorWriteForbidden,
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";
import { productPricingSnapshot } from "@/lib/purchase-order-line-pricing";
import { purchaseOrderLineApiInclude } from "@/lib/purchase-order-include";
import { purchaseOrderLineFromPrisma } from "@/lib/shipping-api";
import { recomputeLineQuantities } from "@/lib/po/osd-recompute";
import {
  findLinesMissingProductAssets,
  formatMissingProductAssetsError,
} from "@/lib/mo-product-assets";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const isDistributor = isDistributorContext(authz.context);
  const distributorSaleChannelId = authz.context.saleChannelId;
  if (isDistributor && !distributorSaleChannelId) {
    return jsonError("Distributor account is not linked to a sale channel", 403);
  }

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const po = await prisma.purchaseOrder.findFirst({
    where: {
      id: pid.data.id,
      storeId,
      type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
      ...(isDistributor ? { saleChannelId: distributorSaleChannelId } : {}),
    },
  });
  if (!po) return jsonError("Purchase order not found", 404);

  const lines = await prisma.purchaseOrderLine.findMany({
    where: {
      purchaseOrderId: pid.data.id,
      purchaseOrder: {
        storeId,
        type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
      },
    },
    include: purchaseOrderLineApiInclude,
    orderBy: { createdAt: "asc" },
  });
  const payload = lines.map((l) => purchaseOrderLineFromPrisma(l));
  return NextResponse.json(
    isDistributor
      ? payload.map((line) => ({
          ...line,
          unitCost: null,
          allocations: [],
          warehouseAllocations: [],
        }))
      : payload,
  );
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  if (isDistributorContext(authz.context)) return distributorWriteForbidden();
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
  const missingProductAssets = findLinesMissingProductAssets([{ product }]);
  if (missingProductAssets.length > 0) {
    return jsonError(
      formatMissingProductAssetsError(
        missingProductAssets,
        "Cannot add this purchase order line",
      ),
      400,
    );
  }

  try {
    const line = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrderLine.create({
        data: {
          purchaseOrderId: pid.data.id,
          productId: parsed.data.productId,
          storeId,
          createdById: userId,
          ...productPricingSnapshot(product),
          quantity: parsed.data.quantity,
          orderedQuantity: parsed.data.quantity,
        },
        include: purchaseOrderLineApiInclude,
      });
      await recomputeLineQuantities(tx, pid.data.id, storeId);
      return tx.purchaseOrderLine.findFirstOrThrow({
        where: { id: created.id },
        include: purchaseOrderLineApiInclude,
      });
    });
    return NextResponse.json(purchaseOrderLineFromPrisma(line), { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
