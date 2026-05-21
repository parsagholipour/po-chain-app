import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { StoreContext } from "@/lib/store";
import { saleChannelLocationCreateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import {
  isDistributorContext,
  isStoreSaleChannelContext,
  requireStoreContext,
} from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

function canAccessSaleChannel(
  context: StoreContext,
  saleChannelId: string,
) {
  return !isDistributorContext(context) || context.saleChannelId === saleChannelId;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  if (isStoreSaleChannelContext(authz.context)) {
    return NextResponse.json([]);
  }

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);
  if (!canAccessSaleChannel(authz.context, pid.data.id)) {
    return jsonError("Sale channel not found", 404);
  }

  const saleChannel = await prisma.saleChannel.findFirst({
    where: { id: pid.data.id, storeId },
    select: { id: true },
  });
  if (!saleChannel) return jsonError("Sale channel not found", 404);

  const rows = await prisma.saleChannelLocation.findMany({
    where: { saleChannelId: pid.data.id, storeId },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(rows);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;
  if (isStoreSaleChannelContext(authz.context)) {
    return jsonError("Store magic-link accounts use temporary session locations", 403);
  }

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);
  if (!canAccessSaleChannel(authz.context, pid.data.id)) {
    return jsonError("Sale channel not found", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = saleChannelLocationCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const saleChannel = await prisma.saleChannel.findFirst({
      where: { id: pid.data.id, storeId },
      select: { id: true },
    });
    if (!saleChannel) return jsonError("Sale channel not found", 404);

    const row = await prisma.saleChannelLocation.create({
      data: {
        ...parsed.data,
        saleChannelId: pid.data.id,
        storeId,
        createdById: userId,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
