import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";
import { manufacturingOrderDetailFromPrisma } from "@/lib/shipping-api";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
  purchaseOrderId: z.uuid(),
});

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; purchaseOrderId: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);

  const row = await prisma.manufacturingOrderPurchaseOrder.findFirst({
    where: {
      manufacturingOrderId: pid.data.id,
      purchaseOrderId: pid.data.purchaseOrderId,
      storeId,
    },
  });
  if (!row) return jsonError("Purchase order link not found", 404);

  try {
    await prisma.$transaction(async (tx) => {
      const lineIds = await tx.manufacturingOrderPurchaseOrderLine.findMany({
        where: { manufacturingOrderId: pid.data.id, storeId },
        select: {
          purchaseOrderLineId: true,
          purchaseOrderLine: { select: { purchaseOrderId: true } },
        },
      });
      const toRemove = lineIds.filter(
        (r) => r.purchaseOrderLine.purchaseOrderId === pid.data.purchaseOrderId,
      );
      for (const r of toRemove) {
        await tx.manufacturingOrderPurchaseOrderLine.delete({
          where: {
            manufacturingOrderId_purchaseOrderLineId: {
              manufacturingOrderId: pid.data.id,
              purchaseOrderLineId: r.purchaseOrderLineId,
            },
          },
        });
      }
      await tx.manufacturingOrderPurchaseOrder.deleteMany({
        where: {
          manufacturingOrderId: pid.data.id,
          purchaseOrderId: pid.data.purchaseOrderId,
          storeId,
        },
      });
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
