import { NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  distributorWriteForbidden,
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";
import {
  shippingCreateSchema,
  shippingCreateToPrisma,
  shippingTypeSchema,
} from "@/lib/validations/shipping";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import {
  createShippingCreatedNotifications,
} from "@/lib/notification-events";
import { dispatchNotificationEmailsSafely } from "@/lib/notifications";
import { shippingDetailInclude } from "@/lib/shipping-include";
import { shippingRowFromPrisma } from "@/lib/shipping-api";
import { reconcileLinkedOrderStatusesForShipping } from "@/lib/shipping-order-status";
import {
  logisticsPartnerTypeForShippingType,
  type ShippingType,
} from "@/lib/shipping";
import {
  PURCHASE_ORDER_TYPE_DISTRIBUTOR,
  PURCHASE_ORDER_TYPE_STOCK,
} from "@/lib/purchase-order-type";

export const runtime = "nodejs";

type ShippingValidationDb = {
  logisticsPartner: {
    findFirst(args: {
      where: { id: string; storeId: string };
      select: { type: true };
    }): Promise<{ type: "freight_forwarder" | "carrier" } | null>;
  };
  manufacturingOrder: {
    count(args: { where: { id: { in: string[] }; storeId: string } }): Promise<number>;
  };
  purchaseOrder: {
    count(args: {
      where: {
        id: { in: string[] };
        storeId: string;
        type: "distributor" | "stock";
        isBackOrder?: boolean;
      };
    }): Promise<number>;
  };
  warehouseOrder: {
    count(args: { where: { id: { in: string[] }; storeId: string } }): Promise<number>;
  };
  saleChannelLocation: {
    findFirst(args: {
      where: { id: string; storeId: string };
      select: {
        id: true;
        name: true;
        recipientName: true;
        companyName: true;
        phoneNumber: true;
        email: true;
        addressLine1: true;
        addressLine2: true;
        city: true;
        stateProvince: true;
        postalCode: true;
        country: true;
        shippingNotes: true;
        saleChannelId: true;
      };
    }): Promise<SaleChannelLocationDestination | null>;
  };
};

function uniqueIds(ids: string[] | undefined) {
  return [...new Set(ids ?? [])];
}

type SaleChannelLocationDestination = {
  id: string;
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
  saleChannelId: string;
};

const destinationFieldNames = [
  "shipToLocationName",
  "shipToRecipientName",
  "shipToCompanyName",
  "shipToPhoneNumber",
  "shipToEmail",
  "shipToAddressLine1",
  "shipToAddressLine2",
  "shipToCity",
  "shipToStateProvince",
  "shipToPostalCode",
  "shipToCountry",
  "shipToNotes",
] as const;

type DestinationFieldName = (typeof destinationFieldNames)[number];

type DestinationInput = Partial<Record<DestinationFieldName, string | null>> & {
  saleChannelLocationId?: string | null;
};

function hasDestinationSnapshotValue(data: DestinationInput) {
  return destinationFieldNames.some((field) => {
    const value = data[field];
    return typeof value === "string" ? value.trim().length > 0 : value != null;
  });
}

function shippingDestinationFromLocation(location: SaleChannelLocationDestination) {
  return {
    saleChannelLocationId: location.id,
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

function shippingDestinationFromOrderSnapshot(order: {
  saleChannelLocationId: string | null;
  saleChannelLocation: SaleChannelLocationDestination | null;
  shipToLocationName: string | null;
  shipToRecipientName: string | null;
  shipToCompanyName: string | null;
  shipToPhoneNumber: string | null;
  shipToEmail: string | null;
  shipToAddressLine1: string | null;
  shipToAddressLine2: string | null;
  shipToCity: string | null;
  shipToStateProvince: string | null;
  shipToPostalCode: string | null;
  shipToCountry: string | null;
  shipToNotes: string | null;
}) {
  if (order.saleChannelLocationId && order.saleChannelLocation) {
    return shippingDestinationFromLocation(order.saleChannelLocation);
  }
  if (
    !order.shipToLocationName ||
    !order.shipToRecipientName ||
    !order.shipToAddressLine1 ||
    !order.shipToCity ||
    !order.shipToCountry
  ) {
    return null;
  }
  return {
    saleChannelLocationId: null,
    shipToLocationName: order.shipToLocationName,
    shipToRecipientName: order.shipToRecipientName,
    shipToCompanyName: order.shipToCompanyName,
    shipToPhoneNumber: order.shipToPhoneNumber,
    shipToEmail: order.shipToEmail,
    shipToAddressLine1: order.shipToAddressLine1,
    shipToAddressLine2: order.shipToAddressLine2,
    shipToCity: order.shipToCity,
    shipToStateProvince: order.shipToStateProvince,
    shipToPostalCode: order.shipToPostalCode,
    shipToCountry: order.shipToCountry,
    shipToNotes: order.shipToNotes,
  };
}

function destinationSignature(
  destination: NonNullable<ReturnType<typeof shippingDestinationFromOrderSnapshot>>,
) {
  return JSON.stringify(destination);
}

async function validateShippingSaleChannelLocation(
  db: ShippingValidationDb,
  {
    storeId,
    saleChannelLocationId,
  }: {
    storeId: string;
    saleChannelLocationId: string;
  },
) {
  const location = await db.saleChannelLocation.findFirst({
    where: { id: saleChannelLocationId, storeId },
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
  if (!location) {
    throw new Error("SALE_CHANNEL_LOCATION_NOT_FOUND");
  }
  return location;
}

async function autoDestinationFromLinkedPurchaseOrders(
  tx: Prisma.TransactionClient,
  {
    storeId,
    purchaseOrderIds,
  }: {
    storeId: string;
    purchaseOrderIds: string[];
  },
) {
  if (purchaseOrderIds.length === 0) return null;
  const orders = await tx.purchaseOrder.findMany({
    where: { id: { in: purchaseOrderIds }, storeId },
    select: {
      saleChannelLocationId: true,
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
    },
  });
  if (orders.length !== purchaseOrderIds.length) return null;
  const destinations = orders.map(shippingDestinationFromOrderSnapshot);
  if (destinations.some((destination) => !destination)) return null;
  const signatures = new Set(
    destinations.map((destination) => destinationSignature(destination!)),
  );
  if (signatures.size !== 1) return null;
  return destinations[0];
}

async function validateShippingWrite(
  db: ShippingValidationDb,
  {
    storeId,
    type,
    logisticsPartnerId,
    manufacturingOrderIds,
    purchaseOrderIds,
    warehouseOrderIds,
  }: {
    storeId: string;
    type: ShippingType;
    logisticsPartnerId?: string | null;
    manufacturingOrderIds?: string[];
    purchaseOrderIds?: string[];
    warehouseOrderIds?: string[];
  },
) {
  const normalizedManufacturingOrderIds = uniqueIds(manufacturingOrderIds);
  const normalizedPurchaseOrderIds = uniqueIds(purchaseOrderIds);
  const normalizedWarehouseOrderIds = uniqueIds(warehouseOrderIds);

  if (logisticsPartnerId) {
    const partner = await db.logisticsPartner.findFirst({
      where: { id: logisticsPartnerId, storeId },
      select: { type: true },
    });
    if (!partner) {
      throw new Error("PARTNER_NOT_FOUND");
    }
    if (partner.type !== logisticsPartnerTypeForShippingType(type)) {
      throw new Error("PARTNER_TYPE_MISMATCH");
    }
  }

  if (type === "manufacturing_order") {
    if (normalizedPurchaseOrderIds.length > 0 || normalizedWarehouseOrderIds.length > 0) {
      throw new Error("ORDER_LINK_TYPE_MISMATCH");
    }
    if (normalizedManufacturingOrderIds.length > 0) {
      const count = await db.manufacturingOrder.count({
        where: { id: { in: normalizedManufacturingOrderIds }, storeId },
      });
      if (count !== normalizedManufacturingOrderIds.length) {
        throw new Error("ORDER_NOT_FOUND");
      }
    }

    return {
      manufacturingOrderIds: normalizedManufacturingOrderIds,
      purchaseOrderIds: [] as string[],
      warehouseOrderIds: [] as string[],
    };
  }

  if (normalizedManufacturingOrderIds.length > 0) {
    throw new Error("ORDER_LINK_TYPE_MISMATCH");
  }

  if (type === "warehouse_order") {
    if (normalizedPurchaseOrderIds.length > 0) {
      throw new Error("ORDER_LINK_TYPE_MISMATCH");
    }
    if (normalizedWarehouseOrderIds.length > 0) {
      const count = await db.warehouseOrder.count({
        where: { id: { in: normalizedWarehouseOrderIds }, storeId },
      });
      if (count !== normalizedWarehouseOrderIds.length) {
        throw new Error("ORDER_NOT_FOUND");
      }
    }

    return {
      manufacturingOrderIds: [] as string[],
      purchaseOrderIds: [] as string[],
      warehouseOrderIds: normalizedWarehouseOrderIds,
    };
  }

  if (normalizedWarehouseOrderIds.length > 0) {
    throw new Error("ORDER_LINK_TYPE_MISMATCH");
  }

  const purchaseOrderType =
    type === "stock_order" ? PURCHASE_ORDER_TYPE_STOCK : PURCHASE_ORDER_TYPE_DISTRIBUTOR;

  if (normalizedPurchaseOrderIds.length > 0) {
    const count = await db.purchaseOrder.count({
      where: {
        id: { in: normalizedPurchaseOrderIds },
        storeId,
        type: purchaseOrderType,
        ...(purchaseOrderType === PURCHASE_ORDER_TYPE_DISTRIBUTOR
          ? { isBackOrder: false }
          : {}),
      },
    });
    if (count !== normalizedPurchaseOrderIds.length) {
      throw new Error("ORDER_NOT_FOUND");
    }
  }

  return {
    manufacturingOrderIds: [] as string[],
    purchaseOrderIds: normalizedPurchaseOrderIds,
    warehouseOrderIds: [] as string[],
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
  const typeRaw = searchParams.get("type");
  const q = searchParams.get("q")?.trim() ?? "";

  const where: Prisma.ShippingWhereInput = { storeId };

  if (isDistributor) {
    where.type = "purchase_order";
    where.purchaseOrderShippings = {
      some: {
        purchaseOrder: {
          storeId,
          type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
          isBackOrder: false,
          saleChannelId: distributorSaleChannelId,
        },
      },
    };
  } else if (typeRaw) {
    const parsedType = shippingTypeSchema.safeParse(typeRaw);
    if (!parsedType.success) return jsonFromZod(parsedType.error);
    where.type = parsedType.data;
  }
  if (q.length > 0) {
    where.OR = [
      { trackingNumber: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { logisticsPartner: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const rows = await prisma.shipping.findMany({
    where,
    include: shippingDetailInclude,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows.map(shippingRowFromPrisma));
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

  const parsed = shippingCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const notificationIds: string[] = [];
      const { manufacturingOrderIds, purchaseOrderIds, warehouseOrderIds } =
        await validateShippingWrite(tx, {
        storeId,
        type: parsed.data.type,
        logisticsPartnerId: parsed.data.logisticsPartnerId,
        manufacturingOrderIds: parsed.data.manufacturingOrderIds,
        purchaseOrderIds: parsed.data.purchaseOrderIds,
        warehouseOrderIds: parsed.data.warehouseOrderIds,
      });

      let shippingData = shippingCreateToPrisma(parsed.data);
      const hasDestinationSnapshot = hasDestinationSnapshotValue(parsed.data);
      const explicitLocation = parsed.data.saleChannelLocationId
        ? await validateShippingSaleChannelLocation(tx, {
            storeId,
            saleChannelLocationId: parsed.data.saleChannelLocationId,
          })
        : null;

      if (
        explicitLocation &&
        (parsed.data.type === "purchase_order" || parsed.data.type === "stock_order") &&
        purchaseOrderIds.length > 0
      ) {
        const linkedOrdersForLocation = await tx.purchaseOrder.count({
          where: {
            id: { in: purchaseOrderIds },
            storeId,
            saleChannelId: explicitLocation.saleChannelId,
            ...(parsed.data.type === "purchase_order" ? { isBackOrder: false } : {}),
          },
        });
        if (linkedOrdersForLocation !== purchaseOrderIds.length) {
          throw new Error("SALE_CHANNEL_LOCATION_ORDER_MISMATCH");
        }
      }

      if (explicitLocation && !hasDestinationSnapshot) {
        shippingData = {
          ...shippingData,
          ...shippingDestinationFromLocation(explicitLocation),
        };
      } else if (
        !parsed.data.saleChannelLocationId &&
        !hasDestinationSnapshot &&
        (parsed.data.type === "purchase_order" || parsed.data.type === "stock_order")
      ) {
        const autoDestination = await autoDestinationFromLinkedPurchaseOrders(tx, {
          storeId,
          purchaseOrderIds,
        });
        if (autoDestination) {
          shippingData = { ...shippingData, ...autoDestination };
        }
      }

      const shipping = await tx.shipping.create({
        data: {
          ...shippingData,
          storeId,
          createdById: userId,
        },
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

      if (purchaseOrderIds.length > 0) {
        await tx.purchaseOrderShipping.createMany({
          data: purchaseOrderIds.map((purchaseOrderId) => ({
            purchaseOrderId,
            shippingId: shipping.id,
            storeId,
          })),
        });
      }

      if (warehouseOrderIds.length > 0) {
        await tx.warehouseOrderShipping.createMany({
          data: warehouseOrderIds.map((warehouseOrderId) => ({
            warehouseOrderId,
            shippingId: shipping.id,
            storeId,
          })),
        });
      }

      await reconcileLinkedOrderStatusesForShipping(tx, {
        storeId,
        manufacturingOrderIds,
        purchaseOrderIds,
        warehouseOrderIds,
      });

      notificationIds.push(
        ...(await createShippingCreatedNotifications(tx, {
          storeId,
          createdById: userId,
          shippingId: shipping.id,
          trackingNumber: shipping.trackingNumber,
          purchaseOrderIds,
          manufacturingOrderIds,
          warehouseOrderIds,
        })),
      );

      return { shippingId: shipping.id, notificationIds };
    });

    const full = await prisma.shipping.findFirst({
      where: { id: result.shippingId, storeId },
      include: shippingDetailInclude,
    });
    await dispatchNotificationEmailsSafely(result.notificationIds);
    return NextResponse.json(full ? shippingRowFromPrisma(full) : null, { status: 201 });
  } catch (e) {
    if (e instanceof Error) {
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
