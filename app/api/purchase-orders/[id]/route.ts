import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  invoicePayloadToPrisma,
  purchaseOrderPatchSchema,
} from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { createOrderStatusLog } from "@/lib/order-status-log";
import { purchaseOrderDetailInclude } from "@/lib/purchase-order-include";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import {
  purchaseOrderDetailFromPrisma,
  redactDistributorPurchaseOrderDetail,
} from "@/lib/shipping-api";
import {
  distributorWriteForbidden,
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

const clearPurchaseOrderDestinationSnapshot = {
  shipToLocationName: null,
  shipToRecipientName: null,
  shipToCompanyName: null,
  shipToPhoneNumber: null,
  shipToEmail: null,
  shipToAddressLine1: null,
  shipToAddressLine2: null,
  shipToCity: null,
  shipToStateProvince: null,
  shipToPostalCode: null,
  shipToCountry: null,
  shipToNotes: null,
};

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

  const row = await prisma.purchaseOrder.findFirst({
    where: {
      id: pid.data.id,
      storeId,
      type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
      ...(isDistributor ? { saleChannelId: distributorSaleChannelId } : {}),
    },
    include: purchaseOrderDetailInclude,
  });
  if (!row) return jsonError("Not found", 404);
  const payload = purchaseOrderDetailFromPrisma(row);
  return NextResponse.json(isDistributor ? redactDistributorPurchaseOrderDetail(payload) : payload);
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

  const parsed = purchaseOrderPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const { saleChannelId, saleChannelLocationId, invoice, ...scalarRest } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseOrder.findFirst({
        where: {
          id: pid.data.id,
          storeId,
          type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        },
        select: {
          id: true,
          invoiceId: true,
          status: true,
          saleChannelId: true,
          saleChannelLocation: { select: { saleChannelId: true } },
        },
      });
      if (!existing) {
        throw new Error("PO_NOT_FOUND_OR_WRONG_TYPE");
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

      const nextSaleChannelId = saleChannelId ?? existing.saleChannelId;
      const locationData: Record<string, unknown> = {};
      if (saleChannelLocationId !== undefined) {
        if (saleChannelLocationId) {
          if (!nextSaleChannelId) {
            throw new Error("SALE_CHANNEL_LOCATION_NOT_FOUND");
          }
          const location = await tx.saleChannelLocation.findFirst({
            where: {
              id: saleChannelLocationId,
              storeId,
              saleChannelId: nextSaleChannelId,
            },
          });
          if (!location) {
            throw new Error("SALE_CHANNEL_LOCATION_NOT_FOUND");
          }
          Object.assign(locationData, purchaseOrderDestinationFromLocation(location));
        } else {
          Object.assign(locationData, clearPurchaseOrderDestinationSnapshot);
        }
        locationData.saleChannelLocationId = saleChannelLocationId;
      } else if (
        saleChannelId !== undefined &&
        existing.saleChannelLocation &&
        existing.saleChannelLocation.saleChannelId !== saleChannelId
      ) {
        locationData.saleChannelLocationId = null;
        Object.assign(locationData, clearPurchaseOrderDestinationSnapshot);
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
        ...locationData,
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
      where: {
        id: pid.data.id,
        storeId,
        type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
      },
      include: purchaseOrderDetailInclude,
    });
    if (!row) return jsonError("Not found", 404);
    return NextResponse.json(purchaseOrderDetailFromPrisma(row));
  } catch (e) {
    if (e instanceof Error && e.message === "PO_NOT_FOUND_OR_WRONG_TYPE") {
      return jsonError("Not found", 404);
    }
    if (e instanceof Error && e.message === "SALE_CHANNEL_NOT_FOUND") {
      return jsonError("Sale channel was not found", 400);
    }
    if (e instanceof Error && e.message === "SALE_CHANNEL_LOCATION_NOT_FOUND") {
      return jsonError("Sale channel location was not found", 400);
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
      const row = await tx.purchaseOrder.findFirst({
        where: {
          id: pid.data.id,
          storeId,
          type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        },
        select: { invoiceId: true },
      });
      if (!row) {
        throw new Error("PO_NOT_FOUND");
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
        where: {
          id: pid.data.id,
          storeId,
          type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        },
      });
      if (row.invoiceId) {
        await tx.invoice.deleteMany({
          where: { id: row.invoiceId, storeId },
        });
      }
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof Error && e.message === "PO_NOT_FOUND") {
      return jsonError("Not found", 404);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
