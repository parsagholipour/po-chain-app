import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import {
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  if (!isDistributorContext(authz.context)) {
    return jsonError("Only distributor accounts can view distributor order invoices", 403);
  }

  const { storeId, saleChannelId } = authz.context;
  if (!saleChannelId) {
    return jsonError("Distributor account is not linked to a sale channel", 403);
  }

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: pid.data.id,
      storeId,
      purpose: "distributor_order",
      draftPurchaseOrders: { some: { saleChannelId } },
    },
    select: {
      id: true,
      invoiceNumber: true,
      purpose: true,
      paymentStatus: true,
      currency: true,
      subtotalAmount: true,
      totalAmount: true,
      paidAt: true,
      createdAt: true,
      draftPurchaseOrders: {
        where: { saleChannelId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          documentKey: true,
          destinationKey: true,
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
          saleChannelLocation: {
            select: { id: true, name: true },
          },
          convertedPurchaseOrder: {
            select: { id: true, number: true, name: true, status: true },
          },
          lines: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              lineTotal: true,
              product: {
                select: { id: true, name: true, sku: true, imageKey: true },
              },
            },
          },
        },
      },
      paymentAttempts: {
        where: { provider: "stripe" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          provider: true,
          status: true,
          providerSessionId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!invoice) return jsonError("Not found", 404);
  return NextResponse.json(invoice);
}
