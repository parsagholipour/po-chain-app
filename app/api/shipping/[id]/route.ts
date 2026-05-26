import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { shippingPatchSchema, shippingPatchToPrisma } from "@/lib/validations/shipping";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { createOrderStatusLog } from "@/lib/order-status-log";
import { createShippingStatusNotifications } from "@/lib/notification-events";
import { dispatchNotificationEmailsSafely } from "@/lib/notifications";
import { shippingDetailInclude } from "@/lib/shipping-include";
import { shippingRowFromPrisma } from "@/lib/shipping-api";
import { logisticsPartnerTypeForShippingType } from "@/lib/shipping";
import { reconcileLinkedOrderStatusesForShipping } from "@/lib/shipping-order-status";
import {
  PURCHASE_ORDER_TYPE_DISTRIBUTOR,
  PURCHASE_ORDER_TYPE_STOCK,
} from "@/lib/purchase-order-type";
import {
  distributorWriteForbidden,
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";
import {
  hasShippingDestinationSnapshotValue,
  shippingDestinationFromLocation,
  type ShippingDestinationLocation,
} from "@/lib/shipping-destination";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

function uniqueIds(ids: string[] | undefined) {
  return [...new Set(ids ?? [])];
}

const notifiableShippingStatuses = ["in_transit", "delivered", "cancelled"] as const;

function isNotifiableShippingStatus(
  status: string,
): status is (typeof notifiableShippingStatuses)[number] {
  return notifiableShippingStatuses.includes(
    status as (typeof notifiableShippingStatuses)[number],
  );
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const isDistributor = isDistributorContext(authz.context);
  const distributorSaleChannelId = authz.context.saleChannelId;
  if (isDistributor && !distributorSaleChannelId) {
    return jsonError("Distributor account is not linked to a sale channel", 403);
  }

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const row = await prisma.shipping.findFirst({
    where: {
      id: pid.data.id,
      storeId,
      ...(isDistributor
        ? {
            type: "purchase_order" as const,
            purchaseOrderShippings: {
              some: {
                purchaseOrder: {
                  storeId,
                  type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
                  isBackOrder: false,
                  saleChannelId: distributorSaleChannelId,
                },
              },
            },
          }
        : {}),
    },
    include: shippingDetailInclude,
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(shippingRowFromPrisma(row));
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  if (isDistributorContext(authz.context)) return distributorWriteForbidden();
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

  const parsed = shippingPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const notificationIds: string[] = [];
      const existing = await tx.shipping.findFirst({
        where: { id: pid.data.id, storeId },
        select: {
          id: true,
          type: true,
          status: true,
          manufacturingOrderShippings: {
            select: { manufacturingOrderId: true },
          },
          purchaseOrderShippings: {
            select: { purchaseOrderId: true },
          },
          warehouseOrderShippings: {
            select: { warehouseOrderId: true },
          },
        },
      });
      if (!existing) {
        throw new Error("SHIPPING_NOT_FOUND");
      }

      const existingManufacturingOrderIds = existing.manufacturingOrderShippings.map(
        (row) => row.manufacturingOrderId,
      );
      const existingPurchaseOrderIds = existing.purchaseOrderShippings.map(
        (row) => row.purchaseOrderId,
      );
      const existingWarehouseOrderIds = existing.warehouseOrderShippings.map(
        (row) => row.warehouseOrderId,
      );

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
      const warehouseOrderIds = uniqueIds(parsed.data.warehouseOrderIds);

      if (existing.type === "manufacturing_order") {
        if (purchaseOrderIds.length > 0 || warehouseOrderIds.length > 0) {
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
      } else if (existing.type === "warehouse_order") {
        if (manufacturingOrderIds.length > 0 || purchaseOrderIds.length > 0) {
          throw new Error("ORDER_LINK_TYPE_MISMATCH");
        }
        if (warehouseOrderIds.length > 0) {
          const count = await tx.warehouseOrder.count({
            where: { id: { in: warehouseOrderIds }, storeId },
          });
          if (count !== warehouseOrderIds.length) {
            throw new Error("ORDER_NOT_FOUND");
          }
        }
      } else {
        if (manufacturingOrderIds.length > 0) {
          throw new Error("ORDER_LINK_TYPE_MISMATCH");
        }
        if (warehouseOrderIds.length > 0) {
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
              ...(existing.type === "purchase_order" ? { isBackOrder: false } : {}),
            },
          });
          if (count !== purchaseOrderIds.length) {
            throw new Error("ORDER_NOT_FOUND");
          }
        }
      }

      const nextManufacturingOrderIds =
        parsed.data.manufacturingOrderIds !== undefined
          ? manufacturingOrderIds
          : existingManufacturingOrderIds;
      const nextPurchaseOrderIds =
        parsed.data.purchaseOrderIds !== undefined ? purchaseOrderIds : existingPurchaseOrderIds;
      const nextWarehouseOrderIds =
        parsed.data.warehouseOrderIds !== undefined
          ? warehouseOrderIds
          : existingWarehouseOrderIds;

      let explicitLocation: ShippingDestinationLocation | null = null;
      if (parsed.data.saleChannelLocationId) {
        explicitLocation = await tx.saleChannelLocation.findFirst({
          where: { id: parsed.data.saleChannelLocationId, storeId },
          select: {
            id: true,
            name: true,
            recipientName: true,
            companyName: true,
            phoneNumber: true,
            email: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            stateProvince: true,
            postalCode: true,
            country: true,
            shippingNotes: true,
            saleChannelId: true,
          },
        });
        if (!explicitLocation) {
          throw new Error("SALE_CHANNEL_LOCATION_NOT_FOUND");
        }
        if (
          (existing.type === "purchase_order" || existing.type === "stock_order") &&
          nextPurchaseOrderIds.length > 0
        ) {
          const linkedOrdersForLocation = await tx.purchaseOrder.count({
            where: {
              id: { in: nextPurchaseOrderIds },
              storeId,
              saleChannelId: explicitLocation.saleChannelId,
              ...(existing.type === "purchase_order" ? { isBackOrder: false } : {}),
            },
          });
          if (linkedOrdersForLocation !== nextPurchaseOrderIds.length) {
            throw new Error("SALE_CHANNEL_LOCATION_ORDER_MISMATCH");
          }
        }
      }

      const shippingData = { ...parsed.data };
      delete shippingData.manufacturingOrderIds;
      delete shippingData.purchaseOrderIds;
      delete shippingData.warehouseOrderIds;
      if (
        explicitLocation &&
        !hasShippingDestinationSnapshotValue(shippingData)
      ) {
        Object.assign(shippingData, shippingDestinationFromLocation(explicitLocation));
      }

      const shipping = await tx.shipping.update({
        where: { id: pid.data.id },
        data: shippingPatchToPrisma(shippingData),
      });

      if (parsed.data.status && parsed.data.status !== existing.status) {
        const statusLog = await createOrderStatusLog({
          tx,
          storeId,
          createdById: userId,
          shippingId: pid.data.id,
          fromStatus: existing.status,
          toStatus: parsed.data.status,
        });
        if (
          statusLog &&
          isNotifiableShippingStatus(parsed.data.status)
        ) {
          notificationIds.push(
            ...(await createShippingStatusNotifications(tx, {
              storeId,
              createdById: userId,
              shippingId: pid.data.id,
              trackingNumber: shipping.trackingNumber,
              toStatus: parsed.data.status,
              statusLogId: statusLog.id,
              purchaseOrderIds: nextPurchaseOrderIds,
              manufacturingOrderIds: nextManufacturingOrderIds,
              warehouseOrderIds: nextWarehouseOrderIds,
            })),
          );
        }
      }

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

      if (parsed.data.warehouseOrderIds !== undefined) {
        await tx.warehouseOrderShipping.deleteMany({
          where: { shippingId: pid.data.id, storeId },
        });
        if (warehouseOrderIds.length > 0) {
          await tx.warehouseOrderShipping.createMany({
            data: warehouseOrderIds.map((warehouseOrderId) => ({
              warehouseOrderId,
              shippingId: shipping.id,
              storeId,
            })),
          });
        }
      }

      await reconcileLinkedOrderStatusesForShipping(tx, {
        storeId,
        manufacturingOrderIds: uniqueIds([
          ...existingManufacturingOrderIds,
          ...nextManufacturingOrderIds,
        ]),
        purchaseOrderIds: uniqueIds([...existingPurchaseOrderIds, ...nextPurchaseOrderIds]),
        warehouseOrderIds: uniqueIds([...existingWarehouseOrderIds, ...nextWarehouseOrderIds]),
      });

      return { shippingId: shipping.id, notificationIds };
    });

    const full = await prisma.shipping.findFirst({
      where: { id: result.shippingId, storeId },
      include: shippingDetailInclude,
    });
    await dispatchNotificationEmailsSafely(result.notificationIds);
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
      if (e.message === "SALE_CHANNEL_LOCATION_NOT_FOUND") {
        return jsonError("Sale channel location was not found", 400);
      }
      if (e.message === "SALE_CHANNEL_LOCATION_ORDER_MISMATCH") {
        return jsonError("Sale channel location does not match the linked orders", 400);
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
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  if (isDistributorContext(authz.context)) return distributorWriteForbidden();
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.shipping.findFirst({
        where: { id: pid.data.id, storeId },
        select: {
          manufacturingOrderShippings: {
            select: { manufacturingOrderId: true },
          },
          purchaseOrderShippings: {
            select: { purchaseOrderId: true },
          },
          warehouseOrderShippings: {
            select: { warehouseOrderId: true },
          },
        },
      });
      if (!existing) {
        throw new Error("SHIPPING_NOT_FOUND");
      }

      await tx.shipping.deleteMany({
        where: { id: pid.data.id, storeId },
      });

      await reconcileLinkedOrderStatusesForShipping(tx, {
        storeId,
        manufacturingOrderIds: existing.manufacturingOrderShippings.map(
          (row) => row.manufacturingOrderId,
        ),
        purchaseOrderIds: existing.purchaseOrderShippings.map((row) => row.purchaseOrderId),
        warehouseOrderIds: existing.warehouseOrderShippings.map(
          (row) => row.warehouseOrderId,
        ),
      });
    });

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof Error && e.message === "SHIPPING_NOT_FOUND") {
      return jsonError("Not found", 404);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
