import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, requireAppUserId } from "@/lib/session-user";
import {
  shippingCreateSchema,
  shippingCreateToPrisma,
  shippingTypeSchema,
} from "@/lib/validations/shipping";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { shippingDetailInclude } from "@/lib/shipping-include";
import { shippingRowFromPrisma } from "@/lib/shipping-api";
import { syncLinkedOrderStatusesForShipping } from "@/lib/shipping-order-status";
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
    findUnique(args: {
      where: { id: string };
      select: { type: true };
    }): Promise<{ type: "freight_forwarder" | "carrier" } | null>;
  };
  manufacturingOrder: {
    count(args: { where: { id: { in: string[] } } }): Promise<number>;
  };
  purchaseOrder: {
    count(args: {
      where: { id: { in: string[] }; type: "distributor" | "stock" };
    }): Promise<number>;
  };
};

function uniqueIds(ids: string[] | undefined) {
  return [...new Set(ids ?? [])];
}

async function validateShippingWrite(
  db: ShippingValidationDb,
  {
    type,
    logisticsPartnerId,
    manufacturingOrderIds,
    purchaseOrderIds,
  }: {
    type: ShippingType;
    logisticsPartnerId?: string | null;
    manufacturingOrderIds?: string[];
    purchaseOrderIds?: string[];
  },
) {
  const normalizedManufacturingOrderIds = uniqueIds(manufacturingOrderIds);
  const normalizedPurchaseOrderIds = uniqueIds(purchaseOrderIds);

  if (logisticsPartnerId) {
    const partner = await db.logisticsPartner.findUnique({
      where: { id: logisticsPartnerId },
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
    if (normalizedPurchaseOrderIds.length > 0) {
      throw new Error("ORDER_LINK_TYPE_MISMATCH");
    }
    if (normalizedManufacturingOrderIds.length > 0) {
      const count = await db.manufacturingOrder.count({
        where: { id: { in: normalizedManufacturingOrderIds } },
      });
      if (count !== normalizedManufacturingOrderIds.length) {
        throw new Error("ORDER_NOT_FOUND");
      }
    }

    return {
      manufacturingOrderIds: normalizedManufacturingOrderIds,
      purchaseOrderIds: [] as string[],
    };
  }

  if (normalizedManufacturingOrderIds.length > 0) {
    throw new Error("ORDER_LINK_TYPE_MISMATCH");
  }

  const purchaseOrderType =
    type === "stock_order" ? PURCHASE_ORDER_TYPE_STOCK : PURCHASE_ORDER_TYPE_DISTRIBUTOR;

  if (normalizedPurchaseOrderIds.length > 0) {
    const count = await db.purchaseOrder.count({
      where: {
        id: { in: normalizedPurchaseOrderIds },
        type: purchaseOrderType,
      },
    });
    if (count !== normalizedPurchaseOrderIds.length) {
      throw new Error("ORDER_NOT_FOUND");
    }
  }

  return {
    manufacturingOrderIds: [] as string[],
    purchaseOrderIds: normalizedPurchaseOrderIds,
  };
}

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const typeRaw = searchParams.get("type");
  const q = searchParams.get("q")?.trim() ?? "";

  const where: {
    type?: ShippingType;
    OR?: Array<Record<string, unknown>>;
  } = {};

  if (typeRaw) {
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
  const authz = await requireAppUserId();
  if (!authz.ok) return authz.response;
  const userId = authz.userId;

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
      const { manufacturingOrderIds, purchaseOrderIds } = await validateShippingWrite(tx, {
        type: parsed.data.type,
        logisticsPartnerId: parsed.data.logisticsPartnerId,
        manufacturingOrderIds: parsed.data.manufacturingOrderIds,
        purchaseOrderIds: parsed.data.purchaseOrderIds,
      });

      const shipping = await tx.shipping.create({
        data: {
          ...shippingCreateToPrisma(parsed.data),
          createdById: userId,
        },
      });

      if (manufacturingOrderIds.length > 0) {
        await tx.manufacturingOrderShipping.createMany({
          data: manufacturingOrderIds.map((manufacturingOrderId) => ({
            manufacturingOrderId,
            shippingId: shipping.id,
          })),
        });
      }

      if (purchaseOrderIds.length > 0) {
        await tx.purchaseOrderShipping.createMany({
          data: purchaseOrderIds.map((purchaseOrderId) => ({
            purchaseOrderId,
            shippingId: shipping.id,
          })),
        });
      }

      await syncLinkedOrderStatusesForShipping(tx, {
        manufacturingOrderIds,
        purchaseOrderIds,
      });

      return shipping.id;
    });

    const full = await prisma.shipping.findUnique({
      where: { id: result },
      include: shippingDetailInclude,
    });
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
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
