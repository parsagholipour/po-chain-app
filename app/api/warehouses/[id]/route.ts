import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { warehouseUpdateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

const warehouseInclude = {
  saleChannel: { select: { id: true, name: true, type: true, logoKey: true } },
};

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

  const row = await prisma.warehouse.findFirst({
    where: { id: pid.data.id, storeId },
    include: warehouseInclude,
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(row);
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

  const parsed = warehouseUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  try {
    const existing = await prisma.warehouse.findFirst({
      where: { id: pid.data.id, storeId },
      select: { id: true },
    });
    if (!existing) return jsonError("Not found", 404);

    if (parsed.data.saleChannelId) {
      const saleChannel = await prisma.saleChannel.findFirst({
        where: { id: parsed.data.saleChannelId, storeId },
        select: { id: true },
      });
      if (!saleChannel) return jsonError("Sale channel not found", 400);
    }

    const row = await prisma.warehouse.update({
      where: { id: pid.data.id },
      data: parsed.data,
      include: warehouseInclude,
    });
    return NextResponse.json(row);
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

  try {
    const inUse = await prisma.warehouseOrder.count({
      where: { warehouseId: pid.data.id, storeId },
    });
    if (inUse > 0) {
      return jsonError("Warehouse is used by warehouse orders", 409);
    }

    const deleted = await prisma.warehouse.deleteMany({
      where: { id: pid.data.id, storeId },
    });
    if (deleted.count === 0) return jsonError("Not found", 404);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
