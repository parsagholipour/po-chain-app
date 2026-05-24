import { NextResponse } from "next/server";
import { z } from "zod";
import { convertPaidDistributorInvoiceDrafts } from "@/lib/distributor-orders/finalize";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { dispatchNotificationEmailsSafely } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  if (!isDistributorContext(authz.context)) {
    return jsonError("Only distributor accounts can place distributor orders", 403);
  }

  const { storeId, saleChannelId } = authz.context;
  if (!saleChannelId) {
    return jsonError("Distributor account is not linked to a sale channel", 403);
  }

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: {
          id: pid.data.id,
          storeId,
          purpose: "distributor_order",
          draftPurchaseOrders: { some: { saleChannelId } },
        },
        select: {
          id: true,
          draftPurchaseOrders: {
            select: {
              saleChannelId: true,
              saleChannel: { select: { type: true } },
            },
          },
        },
      });

      if (!invoice) throw new Error("INVOICE_NOT_FOUND");
      if (invoice.draftPurchaseOrders.length === 0) {
        throw new Error("NO_DRAFT_PURCHASE_ORDERS");
      }
      if (invoice.draftPurchaseOrders.some((draft) => draft.saleChannelId !== saleChannelId)) {
        throw new Error("INVOICE_SALE_CHANNEL_MISMATCH");
      }
      if (invoice.draftPurchaseOrders.some((draft) => draft.saleChannel.type === "store")) {
        throw new Error("STORE_REQUIRES_PAYMENT");
      }
      if (invoice.draftPurchaseOrders.some((draft) => draft.saleChannel.type !== "distributor")) {
        throw new Error("SALE_CHANNEL_NOT_ALLOWED");
      }

      const conversion = await convertPaidDistributorInvoiceDrafts({
        tx,
        invoiceId: invoice.id,
      });

      return {
        invoiceId: invoice.id,
        ...conversion,
      };
    });

    await dispatchNotificationEmailsSafely(result.notificationIds);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "INVOICE_NOT_FOUND") {
        return jsonError("Not found", 404);
      }
      if (e.message === "NO_DRAFT_PURCHASE_ORDERS") {
        return jsonError("This invoice has no draft purchase orders", 400);
      }
      if (e.message === "INVOICE_SALE_CHANNEL_MISMATCH") {
        return jsonError("This invoice belongs to a different sale channel", 403);
      }
      if (e.message === "STORE_REQUIRES_PAYMENT") {
        return jsonError("Store orders require payment before purchase orders are created", 400);
      }
      if (e.message === "SALE_CHANNEL_NOT_ALLOWED") {
        return jsonError("Only distributor sale channels can place orders without payment", 400);
      }
      if (e.message === "DISTRIBUTOR_ORDER_INVOICE_NOT_FOUND") {
        return jsonError("Not found", 404);
      }
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
