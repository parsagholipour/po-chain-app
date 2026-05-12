import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { StoreContext } from "@/lib/store";
import { saleChannelLocationUpdateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { isDistributorContext, requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
  locationId: z.uuid(),
});

function canAccessSaleChannel(context: StoreContext, saleChannelId: string) {
  return !isDistributorContext(context) || context.saleChannelId === saleChannelId;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; locationId: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);
  if (!canAccessSaleChannel(authz.context, pid.data.id)) {
    return jsonError("Not found", 404);
  }

  const row = await prisma.saleChannelLocation.findFirst({
    where: {
      id: pid.data.locationId,
      saleChannelId: pid.data.id,
      storeId,
    },
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(row);
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; locationId: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);
  if (!canAccessSaleChannel(authz.context, pid.data.id)) {
    return jsonError("Not found", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = saleChannelLocationUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  try {
    const existing = await prisma.saleChannelLocation.findFirst({
      where: {
        id: pid.data.locationId,
        saleChannelId: pid.data.id,
        storeId,
      },
      select: { id: true },
    });
    if (!existing) return jsonError("Not found", 404);

    const row = await prisma.saleChannelLocation.update({
      where: { id: pid.data.locationId },
      data: parsed.data,
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
  ctx: { params: Promise<{ id: string; locationId: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);
  if (!canAccessSaleChannel(authz.context, pid.data.id)) {
    return jsonError("Not found", 404);
  }

  try {
    const purchaseOrdersInUse = await prisma.purchaseOrder.count({
      where: {
        saleChannelLocationId: pid.data.locationId,
        saleChannelId: pid.data.id,
        storeId,
      },
    });
    if (purchaseOrdersInUse > 0) {
      return jsonError("Location is used by purchase or stock orders", 409);
    }

    const deleted = await prisma.saleChannelLocation.deleteMany({
      where: {
        id: pid.data.locationId,
        saleChannelId: pid.data.id,
        storeId,
      },
    });
    if (deleted.count === 0) return jsonError("Not found", 404);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
