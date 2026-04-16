import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { shippingPatchSchema, shippingPatchToPrisma } from "@/lib/validations/shipping";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { shippingDetailInclude } from "@/lib/shipping-include";
import { shippingRowFromPrisma } from "@/lib/shipping-api";
import { logisticsPartnerTypeForShippingType } from "@/lib/shipping";
import { syncLinkedOrderStatusesForShipping } from "@/lib/shipping-order-status";
import {
  PURCHASE_ORDER_TYPE_DISTRIBUTOR,
  PURCHASE_ORDER_TYPE_STOCK,
} from "@/lib/purchase-order-type";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

function uniqueIds(ids: string[] | undefined) {
  return [...new Set(ids ?? [])];
}

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

  const row = await prisma.shipping.findFirst({
    where: { id: pid.data.id, storeId },
    include: shippingDetailInclude,
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(shippingRowFromPrisma(row));
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

  const parsed = shippingPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.shipping.findFirst({
        where: { id: pid.data.id, storeId },
        select: { id: true, type: true },
      });
      if (!existing) {
        throw new Error("SHIPPING_NOT_FOUND");
      }

      if (parsed.data.logisticsPartnerId) {
        const partner = await tx.logisticsPartner.findFirst({
          where: { id: parsed.data.logisticsPartnerId, storeId },
          select: { type: true },
        });
        if (!partner) {
          throw new Error("PARTNER_NOT_FOUND");
        }
        if (partner.type !== logisticsPartnerTypeForShippingType(existing.type)) {
          throw new Error("PARTNER_TYPE_MISMATCH");
        }
      }

      const manufacturingOrderIds = uniqueIds(parsed.data.manufacturingOrderIds);
      const purchaseOrderIds = uniqueIds(parsed.data.purchaseOrderIds);

      if (existing.type === "manufacturing_order") {
        if (purchaseOrderIds.length > 0) {
          throw new Error("ORDER_LINK_TYPE_MISMATCH");
        }
        if (manufacturingOrderIds.length > 0) {
          const count = await tx.manufacturingOrder.count({
            where: { id: { in: manufacturingOrderIds }, storeId },
          });
          if (count !== manufacturingOrderIds.length) {
            throw new Error("ORDER_NOT_FOUND");
          }
        }
      } else {
        if (manufacturingOrderIds.length > 0) {
          throw new Error("ORDER_LINK_TYPE_MISMATCH");
        }
        if (purchaseOrderIds.length > 0) {
          const count = await tx.purchaseOrder.count({
            where: {
              id: { in: purchaseOrderIds },
              storeId,
              type:
                existing.type === "stock_order"
                  ? PURCHASE_ORDER_TYPE_STOCK
                  : PURCHASE_ORDER_TYPE_DISTRIBUTOR,
            },
          });
          if (count !== purchaseOrderIds.length) {
            throw new Error("ORDER_NOT_FOUND");
          }
        }
      }

      const shippingData = { ...parsed.data };
      delete shippingData.manufacturingOrderIds;
      delete shippingData.purchaseOrderIds;

      const shipping = await tx.shipping.update({
        where: { id: pid.data.id },
        data: shippingPatchToPrisma(shippingData),
      });

      if (parsed.data.manufacturingOrderIds !== undefined) {
        await tx.manufacturingOrderShipping.deleteMany({
          where: { shippingId: pid.data.id, storeId },
        });
        if (manufacturingOrderIds.length > 0) {
          await tx.manufacturingOrderShipping.createMany({
            data: manufacturingOrderIds.map((manufacturingOrderId) => ({
              manufacturingOrderId,
              shippingId: shipping.id,
              storeId,
            })),
          });
        }
      }

      if (parsed.data.purchaseOrderIds !== undefined) {
        await tx.purchaseOrderShipping.deleteMany({
          where: { shippingId: pid.data.id, storeId },
        });
        if (purchaseOrderIds.length > 0) {
          await tx.purchaseOrderShipping.createMany({
            data: purchaseOrderIds.map((purchaseOrderId) => ({
              purchaseOrderId,
              shippingId: shipping.id,
              storeId,
            })),
          });
        }
      }

      await syncLinkedOrderStatusesForShipping(tx, {
        storeId,
        manufacturingOrderIds:
          parsed.data.manufacturingOrderIds !== undefined ? manufacturingOrderIds : undefined,
        purchaseOrderIds:
          parsed.data.purchaseOrderIds !== undefined ? purchaseOrderIds : undefined,
      });

      return shipping.id;
    });

    const full = await prisma.shipping.findFirst({
      where: { id: result, storeId },
      include: shippingDetailInclude,
    });
    return NextResponse.json(full ? shippingRowFromPrisma(full) : null);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "SHIPPING_NOT_FOUND") {
        return jsonError("Not found", 404);
      }
      if (e.message === "PARTNER_NOT_FOUND") {
        return jsonError("Logistics partner not found", 400);
      }
      if (e.message === "PARTNER_TYPE_MISMATCH") {
        return jsonError("Selected logistics partner does not match the shipping type", 400);
      }
      if (e.message === "ORDER_LINK_TYPE_MISMATCH") {
        return jsonError("Selected orders do not match the shipping type", 400);
      }
      if (e.message === "ORDER_NOT_FOUND") {
        return jsonError("One or more linked orders were not found", 400);
      }
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
    const deleted = await prisma.shipping.deleteMany({
      where: { id: pid.data.id, storeId },
    });
    if (deleted.count === 0) {
      return jsonError("Not found", 404);
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
