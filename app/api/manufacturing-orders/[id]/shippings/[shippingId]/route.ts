import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { moShippingPatchSchema } from "@/lib/validations/manufacturing-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
  shippingId: z.uuid(),
});

function patchData(data: z.infer<typeof moShippingPatchSchema>) {
  const out: {
    trackingNumber?: string;
    shippedAt?: Date;
    invoiceDocumentKey?: string | null;
  } = {};
  if (data.trackingNumber !== undefined) out.trackingNumber = data.trackingNumber;
  if (data.shippedAt !== undefined) out.shippedAt = new Date(data.shippedAt);
  if (data.invoiceDocumentKey !== undefined) out.invoiceDocumentKey = data.invoiceDocumentKey;
  return out;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; shippingId: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = moShippingPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const join = await prisma.manufacturingOrderManufacturingShipping.findUnique({
    where: {
      manufacturingOrderId_manufacturingShippingId: {
        manufacturingOrderId: pid.data.id,
        manufacturingShippingId: pid.data.shippingId,
      },
    },
  });
  if (!join) return jsonError("Shipment not found on this manufacturing order", 404);

  try {
    await prisma.manufacturingShipping.update({
      where: { id: pid.data.shippingId },
      data: patchData(parsed.data),
    });

    const full = await prisma.manufacturingOrder.findUnique({
      where: { id: pid.data.id },
      include: manufacturingOrderDetailInclude,
    });
    return NextResponse.json(full);
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; shippingId: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);

  const join = await prisma.manufacturingOrderManufacturingShipping.findUnique({
    where: {
      manufacturingOrderId_manufacturingShippingId: {
        manufacturingOrderId: pid.data.id,
        manufacturingShippingId: pid.data.shippingId,
      },
    },
  });
  if (!join) return jsonError("Shipment not found on this manufacturing order", 404);

  try {
    await prisma.manufacturingShipping.delete({ where: { id: pid.data.shippingId } });

    const full = await prisma.manufacturingOrder.findUnique({
      where: { id: pid.data.id },
      include: manufacturingOrderDetailInclude,
    });
    return NextResponse.json(full);
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
