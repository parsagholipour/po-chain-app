import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStoreContext } from "@/lib/store-context";
import {
  warehouseOrderCreateSchema,
  warehouseOrderStatusSchema,
} from "@/lib/validations/warehouse-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import type { Prisma } from "@/app/generated/prisma/client";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { warehouseOrderDetailInclude } from "@/lib/warehouse-order-include";
import { warehouseOrderDetailFromPrisma } from "@/lib/shipping-api";
import { assertFulfillmentQuantityAvailable } from "@/lib/fulfillment-quantity";

export const runtime = "nodejs";

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get("status");
  const q = searchParams.get("q")?.trim() ?? "";
  const warehouseIdRaw = searchParams.get("warehouseId");

  const where: Prisma.WarehouseOrderWhereInput = { storeId };
  if (statusRaw) {
    const st = warehouseOrderStatusSchema.safeParse(statusRaw);
    if (st.success) where.status = st.data;
  }
  const whParsed = warehouseIdRaw ? z.uuid().safeParse(warehouseIdRaw) : null;
  if (whParsed?.success) {
    where.warehouseId = whParsed.data;
  }
  if (q.length > 0) {
    const num = Number.parseInt(q, 10);
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      ...(Number.isFinite(num) ? [{ number: num }] : []),
    ];
  }

  const rows = await prisma.warehouseOrder.findMany({
    where,
    orderBy: { number: "desc" },
    select: {
      id: true,
      number: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      warehouse: {
        select: {
          id: true,
          name: true,
        },
      },
      warehouseOrderShippings: {
        select: {
          shipping: {
            select: {
              id: true,
              status: true,
              type: true,
              trackingNumber: true,
            },
          },
        },
      },
      purchaseOrders: {
        select: {
          purchaseOrder: {
            select: {
              id: true,
              number: true,
              name: true,
              type: true,
              saleChannel: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      number: row.number,
      name: row.name,
      status: row.status,
      createdAt: row.createdAt,
      warehouse: row.warehouse,
      linkedOrders: row.purchaseOrders.map((link) => ({
        id: link.purchaseOrder.id,
        name: link.purchaseOrder.name,
        type: link.purchaseOrder.type,
        saleChannelName: link.purchaseOrder.saleChannel?.name ?? null,
      })),
      shippingBadges: row.warehouseOrderShippings.map((s) => ({
        id: s.shipping.id,
        status: s.shipping.status,
        type: s.shipping.type,
        trackingNumber: s.shipping.trackingNumber,
      })),
    })),
  );
}

export async function POST(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = warehouseOrderCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const { name, documentKey, warehouseId, purchaseOrderIds, lines } = parsed.data;
  const lineIds = lines.map((line) => line.purchaseOrderLineId);
  if (new Set(lineIds).size !== lineIds.length) {
    return jsonError("Duplicate purchase order line in list", 400);
  }
  if (purchaseOrderIds.length === 0 && lines.length === 0) {
    return jsonError("At least one purchase order or line is required", 400);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: warehouseId, storeId },
        select: { id: true },
      });
      if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");

      let linkedPurchaseOrderIds = uniqueIds(purchaseOrderIds);
      const lineRows =
        lineIds.length > 0
          ? await tx.purchaseOrderLine.findMany({
              where: { id: { in: lineIds }, storeId },
              select: {
                id: true,
                purchaseOrderId: true,
                purchaseOrder: { select: { type: true } },
              },
            })
          : [];
      if (lineRows.length !== lineIds.length) {
        throw new Error("PURCHASE_ORDER_LINE_NOT_FOUND");
      }
      if (lineRows.some((line) => line.purchaseOrder.type !== PURCHASE_ORDER_TYPE_DISTRIBUTOR)) {
        throw new Error("PURCHASE_ORDER_TYPE_MISMATCH");
      }
      linkedPurchaseOrderIds = uniqueIds([
        ...linkedPurchaseOrderIds,
        ...lineRows.map((line) => line.purchaseOrderId),
      ]);

      const linkedPurchaseOrderCount = await tx.purchaseOrder.count({
        where: {
          id: { in: linkedPurchaseOrderIds },
          storeId,
          type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        },
      });
      if (linkedPurchaseOrderCount !== linkedPurchaseOrderIds.length) {
        throw new Error("PURCHASE_ORDER_NOT_FOUND");
      }

      const wo = await tx.warehouseOrder.create({
        data: {
          name,
          documentKey: documentKey ?? null,
          warehouseId,
          storeId,
          createdById: userId,
        },
      });

      if (linkedPurchaseOrderIds.length > 0) {
        await tx.warehouseOrderPurchaseOrder.createMany({
          data: linkedPurchaseOrderIds.map((purchaseOrderId) => ({
            warehouseOrderId: wo.id,
            purchaseOrderId,
            storeId,
          })),
        });
      }

      for (const line of lines) {
        await assertFulfillmentQuantityAvailable(tx, {
          storeId,
          purchaseOrderLineId: line.purchaseOrderLineId,
          quantity: line.quantity,
        });
        await tx.warehouseOrderPurchaseOrderLine.create({
          data: {
            warehouseOrderId: wo.id,
            purchaseOrderLineId: line.purchaseOrderLineId,
            quantity: line.quantity,
            storeId,
            createdById: userId,
          },
        });
      }

      return wo.id;
    });

    const full = await prisma.warehouseOrder.findFirst({
      where: { id: result, storeId },
      include: warehouseOrderDetailInclude,
    });
    return NextResponse.json(full ? warehouseOrderDetailFromPrisma(full) : null, {
      status: 201,
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "WAREHOUSE_NOT_FOUND") {
        return jsonError("Warehouse not found", 400);
      }
      if (e.message === "PURCHASE_ORDER_NOT_FOUND") {
        return jsonError("One or more purchase orders were not found", 400);
      }
      if (e.message === "PURCHASE_ORDER_LINE_NOT_FOUND") {
        return jsonError("One or more purchase order lines were not found", 400);
      }
      if (e.message === "PURCHASE_ORDER_TYPE_MISMATCH") {
        return jsonError("Warehouse orders can only link distributor purchase orders", 400);
      }
      if (e.message.startsWith("FULFILLMENT_QUANTITY_EXCEEDED:")) {
        const available = e.message.slice("FULFILLMENT_QUANTITY_EXCEEDED:".length);
        return jsonError(`Requested quantity exceeds available fulfillment quantity (${available})`, 409);
      }
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
