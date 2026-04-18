import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { isValidMergedOsdTypeResolution, osdPatchSchema } from "@/lib/validations/purchase-order";
import { purchaseOrderOsdListInclude } from "@/lib/purchase-order-include";
import { purchaseOrderOsdFromPrisma } from "@/lib/shipping-api";
import { validateOsdMoContext } from "@/lib/po/osd-mo-validate";
import { recomputeLineQuantities } from "@/lib/po/osd-recompute";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
  osdId: z.uuid(),
});

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; osdId: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const params = await ctx.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) return jsonFromZod(parsedParams.error);

  const row = await prisma.purchaseOrderOsd.findFirst({
    where: {
      id: parsedParams.data.osdId,
      purchaseOrderId: parsedParams.data.id,
      storeId,
      purchaseOrder: { storeId, type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
    },
    include: purchaseOrderOsdListInclude,
  });
  if (!row) return jsonError("OS&D not found", 404);
  return NextResponse.json(purchaseOrderOsdFromPrisma(row));
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; osdId: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const params = await ctx.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) return jsonFromZod(parsedParams.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = osdPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const existing = await prisma.purchaseOrderOsd.findFirst({
    where: {
      id: parsedParams.data.osdId,
      purchaseOrderId: parsedParams.data.id,
      storeId,
      purchaseOrder: { storeId, type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
    },
    include: { lines: { select: { purchaseOrderLineId: true, quantity: true } } },
  });
  if (!existing) return jsonError("OS&D not found", 404);

  const mergedLines =
    parsed.data.lines ??
    existing.lines.map((l) => ({
      purchaseOrderLineId: l.purchaseOrderLineId,
      quantity: l.quantity,
    }));

  const mergedType = parsed.data.type ?? existing.type;
  const mergedResolution = parsed.data.resolution ?? existing.resolution;
  if (!isValidMergedOsdTypeResolution(mergedType, mergedResolution)) {
    return jsonError("Invalid type and resolution combination", 400);
  }

  const mergedManufacturingOrderId =
    parsed.data.manufacturingOrderId !== undefined
      ? parsed.data.manufacturingOrderId
      : existing.manufacturingOrderId;
  const mergedManufacturerId =
    parsed.data.manufacturerId !== undefined
      ? parsed.data.manufacturerId
      : existing.manufacturerId;

  const moCheck = await validateOsdMoContext(prisma, {
    storeId,
    purchaseOrderId: parsedParams.data.id,
    manufacturingOrderId: mergedManufacturingOrderId,
    manufacturerId: mergedManufacturerId,
    purchaseOrderLineIds: mergedLines.map((l) => l.purchaseOrderLineId),
  });
  if (!moCheck.ok) {
    return jsonError(moCheck.message, 400);
  }

  try {
    const osd = await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderOsd.update({
        where: { id: parsedParams.data.osdId },
        data: {
          type: mergedType,
          resolution: mergedResolution,
          manufacturingOrderId: mergedManufacturingOrderId,
          manufacturerId: mergedManufacturerId,
          ...(parsed.data.documentKey !== undefined
            ? { documentKey: parsed.data.documentKey }
            : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        },
      });

      if (parsed.data.lines) {
        await tx.purchaseOrderOsdLine.deleteMany({
          where: { osdId: parsedParams.data.osdId, storeId },
        });
        for (const l of mergedLines) {
          await tx.purchaseOrderOsdLine.create({
            data: {
              osdId: parsedParams.data.osdId,
              purchaseOrderLineId: l.purchaseOrderLineId,
              quantity: l.quantity,
              storeId,
            },
          });
        }
      }

      try {
        await recomputeLineQuantities(tx, parsedParams.data.id, storeId);
      } catch (e) {
        if (e instanceof Error && e.message === "OSD_NEGATIVE_QUANTITY") {
          throw new Error("OSD_NEGATIVE_QUANTITY");
        }
        throw e;
      }

      const full = await tx.purchaseOrderOsd.findFirstOrThrow({
        where: { id: parsedParams.data.osdId, storeId },
        include: purchaseOrderOsdListInclude,
      });
      return full;
    });
    return NextResponse.json(purchaseOrderOsdFromPrisma(osd));
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
  ctx: { params: Promise<{ id: string; osdId: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const params = await ctx.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) return jsonFromZod(parsedParams.error);

  const existing = await prisma.purchaseOrderOsd.findFirst({
    where: {
      id: parsedParams.data.osdId,
      purchaseOrderId: parsedParams.data.id,
      storeId,
      purchaseOrder: { storeId, type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
    },
    select: { id: true },
  });
  if (!existing) return jsonError("OS&D not found", 404);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderOsd.delete({
        where: { id: parsedParams.data.osdId },
      });
      await recomputeLineQuantities(tx, parsedParams.data.id, storeId);
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
