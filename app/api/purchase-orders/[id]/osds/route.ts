import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { osdCreateSchema } from "@/lib/validations/purchase-order";
import { purchaseOrderOsdListInclude } from "@/lib/purchase-order-include";
import { purchaseOrderOsdFromPrisma } from "@/lib/shipping-api";
import { validateOsdMoContext } from "@/lib/po/osd-mo-validate";
import { recomputeLineQuantities } from "@/lib/po/osd-recompute";

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
    select: { id: true },
  });
  if (!po) return jsonError("Purchase order not found", 404);

  const rows = await prisma.purchaseOrderOsd.findMany({
    where: { purchaseOrderId: pid.data.id, storeId },
    include: purchaseOrderOsdListInclude,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows.map((r) => purchaseOrderOsdFromPrisma(r)));
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

  const parsed = osdCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const po = await prisma.purchaseOrder.findFirst({
    where: {
      id: pid.data.id,
      storeId,
      type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
    },
    select: { id: true },
  });
  if (!po) return jsonError("Purchase order not found", 404);

  const moCheck = await validateOsdMoContext(prisma, {
    storeId,
    purchaseOrderId: pid.data.id,
    manufacturingOrderId: parsed.data.manufacturingOrderId ?? null,
    manufacturerId: parsed.data.manufacturerId ?? null,
    purchaseOrderLineIds: parsed.data.lines.map((l) => l.purchaseOrderLineId),
  });
  if (!moCheck.ok) {
    return jsonError(moCheck.message, 400);
  }

  try {
    const osd = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrderOsd.create({
        data: {
          purchaseOrderId: pid.data.id,
          type: parsed.data.type,
          resolution: parsed.data.resolution,
          manufacturingOrderId: parsed.data.manufacturingOrderId ?? null,
          manufacturerId: parsed.data.manufacturerId ?? null,
          documentKey: parsed.data.documentKey ?? null,
          notes: parsed.data.notes ?? null,
          storeId,
          createdById: userId,
          lines: {
            create: parsed.data.lines.map((l) => ({
              purchaseOrderLineId: l.purchaseOrderLineId,
              quantity: l.quantity,
              storeId,
            })),
          },
        },
        include: purchaseOrderOsdListInclude,
      });
      try {
        await recomputeLineQuantities(tx, pid.data.id, storeId);
      } catch (e) {
        if (e instanceof Error && e.message === "OSD_NEGATIVE_QUANTITY") {
          throw new Error("OSD_NEGATIVE_QUANTITY");
        }
        throw e;
      }
      return created;
    });
    return NextResponse.json(purchaseOrderOsdFromPrisma(osd), { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "OSD_NEGATIVE_QUANTITY") {
      return jsonError("Effective quantity would become negative for one or more lines", 400);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
