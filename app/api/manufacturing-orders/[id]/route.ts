import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { manufacturingOrderPatchSchema } from "@/lib/validations/manufacturing-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";
import { manufacturingOrderDetailFromPrisma } from "@/lib/shipping-api";
import { requireStoreContext } from "@/lib/store-context";

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

  const row = await prisma.manufacturingOrder.findFirst({
    where: { id: pid.data.id, storeId },
    include: manufacturingOrderDetailInclude,
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(manufacturingOrderDetailFromPrisma(row));
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

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
    const existing = await prisma.manufacturingOrder.findFirst({
      where: { id: pid.data.id, storeId },
      select: { id: true },
    });
    if (!existing) return jsonError("Not found", 404);

    if (parsed.data.status === "ready_to_ship") {
      const pivots = await prisma.manufacturingOrderManufacturer.findMany({
        where: { manufacturingOrderId: pid.data.id, storeId },
        select: { status: true, manufacturer: { select: { name: true } } },
      });
      const notReady = pivots.filter((p) => p.status !== "ready_to_pickup");
      if (notReady.length > 0) {
        const names = notReady.map((p) => `${p.manufacturer.name} (${p.status})`).join(", ");
        return jsonError(
          `Cannot set MO to "Ready to ship" — the following manufacturers are not "Ready to pickup": ${names}`,
          409,
        );
      }
    }

    await prisma.manufacturingOrder.update({
      where: { id: pid.data.id },
      data: parsed.data,
    });

    const row = await prisma.manufacturingOrder.findFirst({
      where: { id: pid.data.id, storeId },
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
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const existing = await prisma.manufacturingOrder.findFirst({
    where: { id: pid.data.id, storeId },
    select: { id: true },
  });
  if (!existing) return jsonError("Not found", 404);

  try {
    await prisma.$transaction(async (tx) => {
      const pivots = await tx.manufacturingOrderManufacturer.findMany({
        where: { manufacturingOrderId: pid.data.id, storeId },
        select: { invoiceId: true },
      });
      const invoiceIds = pivots
        .map((p) => p.invoiceId)
        .filter((id): id is string => id != null);
      if (invoiceIds.length > 0) {
        await tx.invoice.deleteMany({
          where: { id: { in: invoiceIds }, storeId },
        });
      }

      const shippingJoins = await tx.manufacturingOrderShipping.findMany({
        where: { manufacturingOrderId: pid.data.id, storeId },
        select: { shippingId: true },
      });
      for (const { shippingId } of shippingJoins) {
        const linkCount = await tx.manufacturingOrderShipping.count({
          where: { shippingId, storeId },
        });
        if (linkCount === 1) {
          await tx.shipping.deleteMany({ where: { id: shippingId, storeId } });
        }
      }

      await tx.manufacturingOrder.deleteMany({
        where: { id: pid.data.id, storeId },
      });
    });

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
