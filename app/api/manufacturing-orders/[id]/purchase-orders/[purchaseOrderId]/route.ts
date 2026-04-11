import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";
import { manufacturingOrderDetailFromPrisma } from "@/lib/shipping-api";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
  purchaseOrderId: z.uuid(),
});

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; purchaseOrderId: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);

  const row = await prisma.manufacturingOrderPurchaseOrder.findUnique({
    where: {
      manufacturingOrderId_purchaseOrderId: {
        manufacturingOrderId: pid.data.id,
        purchaseOrderId: pid.data.purchaseOrderId,
      },
    },
  });
  if (!row) return jsonError("Purchase order link not found", 404);

  try {
    await prisma.$transaction(async (tx) => {
      const lineIds = await tx.manufacturingOrderPurchaseOrderLine.findMany({
        where: { manufacturingOrderId: pid.data.id },
        select: { purchaseOrderLineId: true, purchaseOrderLine: { select: { purchaseOrderId: true } } },
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
      await tx.manufacturingOrderPurchaseOrder.delete({
        where: {
          manufacturingOrderId_purchaseOrderId: {
            manufacturingOrderId: pid.data.id,
            purchaseOrderId: pid.data.purchaseOrderId,
          },
        },
      });
    });

    const full = await prisma.manufacturingOrder.findUnique({
      where: { id: pid.data.id },
      include: manufacturingOrderDetailInclude,
    });
    return NextResponse.json(full ? manufacturingOrderDetailFromPrisma(full) : null);
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
