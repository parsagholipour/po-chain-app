import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { createOrderStatusLog } from "@/lib/order-status-log";
import { requireStoreContext } from "@/lib/store-context";
import { warehouseOrderPatchSchema } from "@/lib/validations/warehouse-order";
import { warehouseOrderDetailInclude } from "@/lib/warehouse-order-include";
import { warehouseOrderDetailFromPrisma } from "@/lib/shipping-api";

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

  const row = await prisma.warehouseOrder.findFirst({
    where: { id: pid.data.id, storeId },
    include: warehouseOrderDetailInclude,
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(warehouseOrderDetailFromPrisma(row));
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

  const parsed = warehouseOrderPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.warehouseOrder.findFirst({
        where: { id: pid.data.id, storeId },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new Error("WO_NOT_FOUND");
      }

      if (parsed.data.warehouseId !== undefined) {
        const warehouse = await tx.warehouse.findFirst({
          where: { id: parsed.data.warehouseId, storeId },
          select: { id: true },
        });
        if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");
      }

      await tx.warehouseOrder.update({
        where: { id: pid.data.id },
        data: parsed.data,
      });

      if (parsed.data.status && parsed.data.status !== existing.status) {
        await createOrderStatusLog({
          tx,
          storeId,
          createdById: userId,
          warehouseOrderId: pid.data.id,
          fromStatus: existing.status,
          toStatus: parsed.data.status,
        });
      }
    });

    const row = await prisma.warehouseOrder.findFirst({
      where: { id: pid.data.id, storeId },
      include: warehouseOrderDetailInclude,
    });
    return NextResponse.json(row ? warehouseOrderDetailFromPrisma(row) : null);
  } catch (e) {
    if (e instanceof Error && e.message === "WO_NOT_FOUND") {
      return jsonError("Not found", 404);
    }
    if (e instanceof Error && e.message === "WAREHOUSE_NOT_FOUND") {
      return jsonError("Warehouse not found", 400);
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

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.warehouseOrder.findFirst({
        where: { id: pid.data.id, storeId },
        select: { id: true },
      });
      if (!existing) throw new Error("WO_NOT_FOUND");

      const shippingJoins = await tx.warehouseOrderShipping.findMany({
        where: { warehouseOrderId: pid.data.id, storeId },
        select: { shippingId: true },
      });
      for (const { shippingId } of shippingJoins) {
        const linkCount = await tx.warehouseOrderShipping.count({
          where: { shippingId, storeId },
        });
        if (linkCount === 1) {
          await tx.shipping.deleteMany({ where: { id: shippingId, storeId } });
        }
      }

      await tx.warehouseOrder.deleteMany({
        where: { id: pid.data.id, storeId },
      });
    });

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof Error && e.message === "WO_NOT_FOUND") {
      return jsonError("Not found", 404);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
