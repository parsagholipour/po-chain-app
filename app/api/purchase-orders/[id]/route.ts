import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { purchaseOrderPatchSchema } from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { purchaseOrderDetailInclude } from "@/lib/purchase-order-include";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";

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

  const row = await prisma.purchaseOrder.findFirst({
    where: { id: pid.data.id, type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
    include: purchaseOrderDetailInclude,
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(row);
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

  const parsed = purchaseOrderPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const { saleChannelId, ...rest } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseOrder.findFirst({
        where: { id: pid.data.id, type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
        select: { id: true },
      });
      if (!existing) {
        throw new Error("PO_NOT_FOUND_OR_WRONG_TYPE");
      }

      if (saleChannelId !== undefined) {
        const sc = await tx.saleChannel.findUnique({ where: { id: saleChannelId } });
        if (!sc) {
          throw new Error("SALE_CHANNEL_NOT_FOUND");
        }
      }

      const data = {
        ...rest,
        ...(saleChannelId !== undefined
          ? { saleChannel: { connect: { id: saleChannelId } } }
          : {}),
      };
      if (Object.keys(data).length > 0) {
        await tx.purchaseOrder.update({
          where: { id: pid.data.id },
          data,
        });
      }
    });

    const row = await prisma.purchaseOrder.findFirst({
      where: { id: pid.data.id, type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
      include: purchaseOrderDetailInclude,
    });
    if (!row) return jsonError("Not found", 404);
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof Error && e.message === "PO_NOT_FOUND_OR_WRONG_TYPE") {
      return jsonError("Not found", 404);
    }
    if (e instanceof Error && e.message === "SALE_CHANNEL_NOT_FOUND") {
      return jsonError("Sale channel was not found", 400);
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
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  try {
    const deleted = await prisma.purchaseOrder.deleteMany({
      where: { id: pid.data.id, type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
    });
    if (deleted.count === 0) return jsonError("Not found", 404);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
