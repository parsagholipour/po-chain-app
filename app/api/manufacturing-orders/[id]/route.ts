import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";
import { createOrderStatusLog } from "@/lib/order-status-log";
import { manufacturingOrderDetailFromPrisma } from "@/lib/shipping-api";
import { requireStoreContext } from "@/lib/store-context";
import { manufacturingOrderPatchSchema } from "@/lib/validations/manufacturing-order";

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
  const { storeId, userId } = authz.context;

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
    await prisma.$transaction(async (tx) => {
      const existing = await tx.manufacturingOrder.findFirst({
        where: { id: pid.data.id, storeId },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new Error("MO_NOT_FOUND");
      }

      if (parsed.data.status === "ready_to_ship") {
        const pivots = await tx.manufacturingOrderManufacturer.findMany({
          where: { manufacturingOrderId: pid.data.id, storeId },
          select: { status: true, manufacturer: { select: { name: true } } },
        });
        const notReady = pivots.filter((pivot) => pivot.status !== "ready_to_pickup");
        if (notReady.length > 0) {
          const names = notReady
            .map((pivot) => `${pivot.manufacturer.name} (${pivot.status})`)
            .join(", ");
          throw new Error(`MO_READY_TO_SHIP_BLOCKED:${names}`);
        }
      }

      await tx.manufacturingOrder.update({
        where: { id: pid.data.id },
        data: parsed.data,
      });

      if (parsed.data.status && parsed.data.status !== existing.status) {
        await createOrderStatusLog({
          tx,
          storeId,
          createdById: userId,
          manufacturingOrderId: pid.data.id,
          fromStatus: existing.status,
          toStatus: parsed.data.status,
        });
      }
    });

    const row = await prisma.manufacturingOrder.findFirst({
      where: { id: pid.data.id, storeId },
      include: manufacturingOrderDetailInclude,
    });
    return NextResponse.json(row ? manufacturingOrderDetailFromPrisma(row) : null);
  } catch (e) {
    if (e instanceof Error && e.message === "MO_NOT_FOUND") {
      return jsonError("Not found", 404);
    }
    if (e instanceof Error && e.message.startsWith("MO_READY_TO_SHIP_BLOCKED:")) {
      const names = e.message.slice("MO_READY_TO_SHIP_BLOCKED:".length);
      return jsonError(
        `Cannot set MO to "Ready to ship" - the following manufacturers are not "Ready to pickup": ${names}`,
        409,
      );
    }
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
        .map((pivot) => pivot.invoiceId)
        .filter((invoiceId): invoiceId is string => invoiceId != null);
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
