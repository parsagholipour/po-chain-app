import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  invoicePayloadToPrisma,
  stockOrderPatchSchema,
} from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { createOrderStatusLog } from "@/lib/order-status-log";
import { purchaseOrderDetailInclude } from "@/lib/purchase-order-include";
import { PURCHASE_ORDER_TYPE_STOCK } from "@/lib/purchase-order-type";
import { purchaseOrderDetailFromPrisma } from "@/lib/shipping-api";
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

  const row = await prisma.purchaseOrder.findFirst({
    where: { id: pid.data.id, storeId, type: PURCHASE_ORDER_TYPE_STOCK },
    include: purchaseOrderDetailInclude,
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(purchaseOrderDetailFromPrisma(row));
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

  const parsed = stockOrderPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const { saleChannelId, invoice, ...scalarRest } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseOrder.findFirst({
        where: { id: pid.data.id, storeId, type: PURCHASE_ORDER_TYPE_STOCK },
        select: { id: true, invoiceId: true, status: true },
      });
      if (!existing) {
        throw new Error("SO_NOT_FOUND");
      }

      if (saleChannelId !== undefined) {
        const sc = await tx.saleChannel.findFirst({
          where: { id: saleChannelId, storeId },
          select: { id: true },
        });
        if (!sc) {
          throw new Error("SALE_CHANNEL_NOT_FOUND");
        }
      }

      if (invoice) {
        const invData = invoicePayloadToPrisma(invoice);
        if (existing.invoiceId) {
          await tx.invoice.update({
            where: { id: existing.invoiceId },
            data: invData,
          });
        } else {
          const inv = await tx.invoice.create({
            data: {
              ...invData,
              storeId,
              createdById: userId,
            },
          });
          await tx.purchaseOrder.update({
            where: { id: pid.data.id },
            data: { invoiceId: inv.id },
          });
        }
      }

      const data = {
        ...scalarRest,
        ...(saleChannelId !== undefined ? { saleChannelId } : {}),
      };
      if (Object.keys(data).length > 0) {
        await tx.purchaseOrder.update({
          where: { id: pid.data.id },
          data,
        });
      }

      if (scalarRest.status && scalarRest.status !== existing.status) {
        await createOrderStatusLog({
          tx,
          storeId,
          createdById: userId,
          purchaseOrderId: pid.data.id,
          fromStatus: existing.status,
          toStatus: scalarRest.status,
        });
      }
    });

    const row = await prisma.purchaseOrder.findFirst({
      where: { id: pid.data.id, storeId, type: PURCHASE_ORDER_TYPE_STOCK },
      include: purchaseOrderDetailInclude,
    });
    return NextResponse.json(row ? purchaseOrderDetailFromPrisma(row) : null);
  } catch (e) {
    if (e instanceof Error && e.message === "SO_NOT_FOUND") {
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
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.purchaseOrder.findFirst({
        where: { id: pid.data.id, storeId, type: PURCHASE_ORDER_TYPE_STOCK },
        select: { invoiceId: true },
      });
      if (!row) {
        throw new Error("SO_NOT_FOUND");
      }

      const linkedShippingRows = await tx.purchaseOrderShipping.findMany({
        where: {
          purchaseOrderId: pid.data.id,
          storeId,
        },
        select: { shippingId: true },
      });

      for (const shippingId of new Set(linkedShippingRows.map((row) => row.shippingId))) {
        const shippingLinkCount = await tx.purchaseOrderShipping.count({
          where: { shippingId, storeId },
        });
        if (shippingLinkCount === 1) {
          await tx.shipping.deleteMany({
            where: { id: shippingId, storeId },
          });
        }
      }

      await tx.purchaseOrder.deleteMany({
        where: { id: pid.data.id, storeId, type: PURCHASE_ORDER_TYPE_STOCK },
      });
      if (row.invoiceId) {
        await tx.invoice.deleteMany({
          where: { id: row.invoiceId, storeId },
        });
      }
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof Error && e.message === "SO_NOT_FOUND") {
      return jsonError("Not found", 404);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
