import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  distributorWriteForbidden,
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";
import {
  purchaseOrderCreateSchema,
  purchaseOrderStatusSchema,
} from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { createManualPurchaseOrderNotification } from "@/lib/notification-events";
import { dispatchNotificationEmailsSafely } from "@/lib/notifications";
import type { Prisma } from "@/app/generated/prisma/client";
import { purchaseOrderDetailInclude } from "@/lib/purchase-order-include";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { purchaseOrderDetailFromPrisma } from "@/lib/shipping-api";
import { productPricingSnapshot } from "@/lib/purchase-order-line-pricing";
import {
  findLinesMissingProductAssets,
  formatMissingProductAssetsError,
} from "@/lib/mo-product-assets";

export const runtime = "nodejs";

function purchaseOrderDestinationFromLocation(location: {
  name: string;
  recipientName: string;
  companyName: string | null;
  phoneNumber: string | null;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string | null;
  postalCode: string | null;
  country: string;
  shippingNotes: string | null;
}) {
  return {
    shipToLocationName: location.name,
    shipToRecipientName: location.recipientName,
    shipToCompanyName: location.companyName,
    shipToPhoneNumber: location.phoneNumber,
    shipToEmail: location.email,
    shipToAddressLine1: location.addressLine1,
    shipToAddressLine2: location.addressLine2,
    shipToCity: location.city,
    shipToStateProvince: location.stateProvince,
    shipToPostalCode: location.postalCode,
    shipToCountry: location.country,
    shipToNotes: location.shippingNotes,
  };
}

export async function GET(request: Request) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const isDistributor = isDistributorContext(authz.context);
  const distributorSaleChannelId = authz.context.saleChannelId;
  if (isDistributor && !distributorSaleChannelId) {
    return jsonError("Distributor account is not linked to a sale channel", 403);
  }

  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get("status");
  const q = searchParams.get("q")?.trim() ?? "";
  const saleChannelIdRaw = searchParams.get("saleChannelId");
  const manufacturerIdRaw = searchParams.get("manufacturerId");

  const where: Prisma.PurchaseOrderWhereInput = {
    storeId,
    type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
  };
  if (statusRaw) {
    const st = purchaseOrderStatusSchema.safeParse(statusRaw);
    if (st.success) where.status = st.data;
  }
  if (isDistributor) {
    where.saleChannelId = distributorSaleChannelId;
  } else {
    const scParsed = saleChannelIdRaw ? z.uuid().safeParse(saleChannelIdRaw) : null;
    if (scParsed?.success) {
      where.saleChannelId = scParsed.data;
    }
  }
  const mfParsed = manufacturerIdRaw ? z.uuid().safeParse(manufacturerIdRaw) : null;
  if (mfParsed?.success) {
    where.lines = {
      some: {
        manufacturingOrderLines: { some: { manufacturerId: mfParsed.data } },
      },
    };
  }
  if (q.length > 0) {
    const num = Number.parseInt(q, 10);
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      ...(Number.isFinite(num) ? [{ number: num }] : []),
    ];
  }

  const rows = await prisma.purchaseOrder.findMany({
    where,
    orderBy: { number: "desc" },
    select: {
      id: true,
      number: true,
      name: true,
      status: true,
      isBackOrder: true,
      actualizedPoId: true,
      actualizedPo: {
        select: {
          id: true,
          number: true,
          name: true,
        },
      },
      createdAt: true,
      updatedAt: true,
      lines: {
        select: {
          manufacturingOrderLines: {
            select: {
              manufacturerId: true,
            },
            take: 1,
          },
        },
      },
      saleChannel: {
        select: {
          id: true,
          name: true,
          type: true,
          logoKey: true,
        },
      },
      saleChannelLocation: true,
      shipToLocationName: true,
      shipToRecipientName: true,
      shipToCompanyName: true,
      shipToPhoneNumber: true,
      shipToEmail: true,
      shipToAddressLine1: true,
      shipToAddressLine2: true,
      shipToCity: true,
      shipToStateProvince: true,
      shipToPostalCode: true,
      shipToCountry: true,
      shipToNotes: true,
      manufacturingOrderPurchaseOrders: {
        select: {
          manufacturingOrder: {
            select: {
              id: true,
              number: true,
              name: true,
              status: true,
            },
          },
        },
      },
      warehouseOrderPurchaseOrders: {
        select: {
          warehouseOrder: {
            select: {
              id: true,
              number: true,
              name: true,
              status: true,
              warehouse: { select: { name: true } },
            },
          },
        },
      },
      purchaseOrderShippings: {
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
    },
  });
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
      status: r.status,
      isBackOrder: r.isBackOrder,
      actualizedPoId: r.actualizedPoId,
      actualizedPo: r.actualizedPo,
      createdAt: r.createdAt,
      saleChannel: r.saleChannel,
      saleChannelLocation: r.saleChannelLocation,
      shipToLocationName: r.shipToLocationName,
      shipToRecipientName: r.shipToRecipientName,
      shipToCompanyName: r.shipToCompanyName,
      shipToPhoneNumber: r.shipToPhoneNumber,
      shipToEmail: r.shipToEmail,
      shipToAddressLine1: r.shipToAddressLine1,
      shipToAddressLine2: r.shipToAddressLine2,
      shipToCity: r.shipToCity,
      shipToStateProvince: r.shipToStateProvince,
      shipToPostalCode: r.shipToPostalCode,
      shipToCountry: r.shipToCountry,
      shipToNotes: r.shipToNotes,
      manufacturers: isDistributor
        ? []
        : Array.from(
            new Set(
              r.lines
                .flatMap((line) => line.manufacturingOrderLines.map((mol) => mol.manufacturerId))
                .filter((id): id is string => id != null)
            )
          ).map((manufacturerId) => ({
            manufacturerId,
            name: "",
            status: "",
          })),
      manufacturingOrders: isDistributor
        ? []
        : r.manufacturingOrderPurchaseOrders.map((mo) => ({
            id: mo.manufacturingOrder.id,
            number: mo.manufacturingOrder.number,
            name: mo.manufacturingOrder.name,
            status: mo.manufacturingOrder.status,
          })),
      warehouseOrders: isDistributor
        ? []
        : r.warehouseOrderPurchaseOrders.map((wo) => ({
            id: wo.warehouseOrder.id,
            number: wo.warehouseOrder.number,
            name: wo.warehouseOrder.name,
            status: wo.warehouseOrder.status,
            warehouseName: wo.warehouseOrder.warehouse.name,
          })),
      shippingBadges: r.purchaseOrderShippings.map((s) => ({
        id: s.shipping.id,
        status: s.shipping.status,
        type: s.shipping.type,
        trackingNumber: s.shipping.trackingNumber,
      })),
    })),
  );
}

export async function POST(request: Request) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  if (isDistributorContext(authz.context)) return distributorWriteForbidden();
  const { userId, storeId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = purchaseOrderCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const { name, documentKey, saleChannelId, saleChannelLocationId, lines } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sc = await tx.saleChannel.findFirst({
        where: { id: saleChannelId, storeId },
      });
      if (!sc) {
        throw new Error("SALE_CHANNEL_NOT_FOUND");
      }
      let locationSnapshot: ReturnType<typeof purchaseOrderDestinationFromLocation> | null = null;
      if (saleChannelLocationId) {
        const location = await tx.saleChannelLocation.findFirst({
          where: {
            id: saleChannelLocationId,
            storeId,
            saleChannelId,
          },
        });
        if (!location) {
          throw new Error("SALE_CHANNEL_LOCATION_NOT_FOUND");
        }
        locationSnapshot = purchaseOrderDestinationFromLocation(location);
      }

      const productPricingById = new Map<string, { cost: unknown; price: unknown }>();
      if (lines.length > 0) {
        const pIds = [...new Set(lines.map((l) => l.productId))];
        const products = await tx.product.findMany({
          where: { id: { in: pIds }, storeId },
          select: {
            id: true,
            cost: true,
            price: true,
            name: true,
            sku: true,
            barcodeKey: true,
            packagingKey: true,
            verified: true,
          },
        });
        if (products.length !== pIds.length) {
          throw new Error("PRODUCT_NOT_FOUND");
        }
        const missingProductAssets = findLinesMissingProductAssets(
          products.map((product) => ({ product })),
        );
        if (missingProductAssets.length > 0) {
          throw new Error(
            formatMissingProductAssetsError(
              missingProductAssets,
              "Cannot create this purchase order",
            ),
          );
        }
        for (const product of products) {
          productPricingById.set(product.id, product);
        }
      }

      const po = await tx.purchaseOrder.create({
        data: {
          name,
          type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
          documentKey: documentKey ?? null,
          storeId,
          saleChannelId,
          saleChannelLocationId: saleChannelLocationId ?? null,
          ...(locationSnapshot ?? {}),
          createdById: userId,
        },
      });

      for (const line of lines) {
        const productPricing = productPricingById.get(line.productId);
        if (!productPricing) {
          throw new Error("PRODUCT_NOT_FOUND");
        }
        await tx.purchaseOrderLine.create({
          data: {
            purchaseOrderId: po.id,
            productId: line.productId,
            storeId,
            createdById: userId,
            ...productPricingSnapshot(productPricing),
            quantity: line.quantity,
            orderedQuantity: line.quantity,
          },
        });
      }

      const notificationIds = await createManualPurchaseOrderNotification(tx, {
        storeId,
        createdById: userId,
        purchaseOrder: {
          id: po.id,
          number: po.number,
          name: po.name,
          saleChannelId: po.saleChannelId,
        },
      });

      return { purchaseOrderId: po.id, notificationIds };
    });

    await dispatchNotificationEmailsSafely(result.notificationIds);

    const full = await prisma.purchaseOrder.findFirst({
      where: { id: result.purchaseOrderId, storeId, type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
      include: purchaseOrderDetailInclude,
    });
    return NextResponse.json(full ? purchaseOrderDetailFromPrisma(full) : null, {
      status: 201,
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "SALE_CHANNEL_NOT_FOUND") {
        return jsonError("Sale channel was not found", 400);
      }
      if (e.message === "SALE_CHANNEL_LOCATION_NOT_FOUND") {
        return jsonError("Sale channel location was not found", 400);
      }
      if (e.message === "PRODUCT_NOT_FOUND") {
        return jsonError("One or more products were not found", 400);
      }
      if (e.message.startsWith("Cannot create this purchase order")) {
        return jsonError(e.message, 400);
      }
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
