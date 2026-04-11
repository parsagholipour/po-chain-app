import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { manufacturingOrderPatchSchema } from "@/lib/validations/manufacturing-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";
import { manufacturingOrderDetailFromPrisma } from "@/lib/shipping-api";

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

  const row = await prisma.manufacturingOrder.findUnique({
    where: { id: pid.data.id },
    include: manufacturingOrderDetailInclude,
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(manufacturingOrderDetailFromPrisma(row));
}

export async function PATCH(
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

  const parsed = manufacturingOrderPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  try {
    await prisma.manufacturingOrder.update({
      where: { id: pid.data.id },
      data: parsed.data,
    });

    const row = await prisma.manufacturingOrder.findUnique({
      where: { id: pid.data.id },
      include: manufacturingOrderDetailInclude,
    });
    return NextResponse.json(row ? manufacturingOrderDetailFromPrisma(row) : null);
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const existing = await prisma.manufacturingOrder.findUnique({
    where: { id: pid.data.id },
    select: { id: true },
  });
  if (!existing) return jsonError("Not found", 404);

  try {
    await prisma.$transaction(async (tx) => {
      const pivots = await tx.manufacturingOrderManufacturer.findMany({
        where: { manufacturingOrderId: pid.data.id },
        select: { invoiceId: true },
      });
      const invoiceIds = pivots
        .map((p) => p.invoiceId)
        .filter((id): id is string => id != null);
      if (invoiceIds.length > 0) {
        await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      }

      const shippingJoins = await tx.manufacturingOrderShipping.findMany({
        where: { manufacturingOrderId: pid.data.id },
        select: { shippingId: true },
      });
      for (const { shippingId } of shippingJoins) {
        const linkCount = await tx.manufacturingOrderShipping.count({
          where: { shippingId },
        });
        if (linkCount === 1) {
          await tx.shipping.delete({ where: { id: shippingId } });
        }
      }

      await tx.manufacturingOrder.delete({ where: { id: pid.data.id } });
    });

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
