import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { createBackorderActualizedNotification } from "@/lib/notification-events";
import { dispatchNotificationEmailsSafely } from "@/lib/notifications";
import { purchaseOrderDetailInclude } from "@/lib/purchase-order-include";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { purchaseOrderDetailFromPrisma } from "@/lib/shipping-api";
import {
  distributorWriteForbidden,
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });
const backOrderNameSuffixPattern = /\s-\sback order\s*$/i;

function actualizedPurchaseOrderName(name: string) {
  const actualizedName = name.replace(backOrderNameSuffixPattern, "");
  return actualizedName.trim().length > 0 ? actualizedName : name;
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  if (isDistributorContext(authz.context)) return distributorWriteForbidden();
  const { storeId, userId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const backPo = await tx.purchaseOrder.findFirst({
        where: {
          id: pid.data.id,
          storeId,
          type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        },
        include: {
          lines: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!backPo) throw new Error("PO_NOT_FOUND");
      if (!backPo.isBackOrder) throw new Error("PO_NOT_BACK_ORDER");
      if (backPo.actualizedPoId) throw new Error("PO_ALREADY_ACTUALIZED");

      const actualizedPo = await tx.purchaseOrder.create({
        data: {
          name: actualizedPurchaseOrderName(backPo.name),
          type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
          status: "open",
          invoiceId: backPo.invoiceId,
          documentKey: backPo.documentKey,
          saleChannelId: backPo.saleChannelId,
          saleChannelLocationId: backPo.saleChannelLocationId,
          shipToLocationName: backPo.shipToLocationName,
          shipToRecipientName: backPo.shipToRecipientName,
          shipToCompanyName: backPo.shipToCompanyName,
          shipToPhoneNumber: backPo.shipToPhoneNumber,
          shipToEmail: backPo.shipToEmail,
          shipToAddressLine1: backPo.shipToAddressLine1,
          shipToAddressLine2: backPo.shipToAddressLine2,
          shipToCity: backPo.shipToCity,
          shipToStateProvince: backPo.shipToStateProvince,
          shipToPostalCode: backPo.shipToPostalCode,
          shipToCountry: backPo.shipToCountry,
          shipToNotes: backPo.shipToNotes,
          storeId,
          createdById: userId,
        },
        select: {
          id: true,
          number: true,
          name: true,
          saleChannelId: true,
        },
      });

      if (backPo.lines.length > 0) {
        await tx.purchaseOrderLine.createMany({
          data: backPo.lines.map((line) => ({
            purchaseOrderId: actualizedPo.id,
            productId: line.productId,
            quantity: line.quantity,
            orderedQuantity: line.orderedQuantity,
            unitCost: line.unitCost,
            unitPrice: line.unitPrice,
            storeId,
            createdById: userId,
          })),
        });
      }

      await tx.purchaseOrder.update({
        where: { id: backPo.id },
        data: { actualizedPoId: actualizedPo.id },
      });

      const notificationIds = await createBackorderActualizedNotification(tx, {
        storeId,
        createdById: userId,
        backorder: backPo,
        actualizedPurchaseOrder: actualizedPo,
      });

      return { actualizedPoId: actualizedPo.id, notificationIds };
    });

    const full = await prisma.purchaseOrder.findFirst({
      where: { id: result.actualizedPoId, storeId, type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
      include: purchaseOrderDetailInclude,
    });
    await dispatchNotificationEmailsSafely(result.notificationIds);
    return NextResponse.json(full ? purchaseOrderDetailFromPrisma(full) : null, {
      status: 201,
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "PO_NOT_FOUND") {
        return jsonError("Not found", 404);
      }
      if (e.message === "PO_NOT_BACK_ORDER") {
        return jsonError("Only Back Order POs can be actualized", 400);
      }
      if (e.message === "PO_ALREADY_ACTUALIZED") {
        return jsonError("This Back Order PO has already been actualized", 409);
      }
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
