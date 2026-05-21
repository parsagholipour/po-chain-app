import type { Prisma } from "@/app/generated/prisma/client";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";

export async function convertPaidDistributorInvoiceDrafts({
  tx,
  invoiceId,
}: {
  tx: Prisma.TransactionClient;
  invoiceId: string;
}) {
  const now = new Date();

  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      purpose: true,
      paymentStatus: true,
      paidAt: true,
      storeId: true,
    },
  });

  if (!invoice || invoice.purpose !== "distributor_order") {
    throw new Error("DISTRIBUTOR_ORDER_INVOICE_NOT_FOUND");
  }

  if (invoice.paymentStatus !== "paid") {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paymentStatus: "paid",
        paidAt: invoice.paidAt ?? now,
      },
    });
  } else if (!invoice.paidAt) {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAt: now },
    });
  }

  const drafts = await tx.draftPurchaseOrder.findMany({
    where: {
      invoiceId: invoice.id,
      storeId: invoice.storeId,
      status: { not: "cancelled" },
    },
    include: {
      lines: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const convertedPurchaseOrderIds: string[] = [];

  for (const draft of drafts) {
    if (draft.convertedPurchaseOrderId) {
      convertedPurchaseOrderIds.push(draft.convertedPurchaseOrderId);
      if (draft.status !== "converted") {
        await tx.draftPurchaseOrder.update({
          where: { id: draft.id },
          data: { status: "converted" },
        });
      }
      continue;
    }

    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        name: draft.name,
        type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        status: "open",
        invoiceId: invoice.id,
        documentKey: draft.documentKey,
        saleChannelId: draft.saleChannelId,
        saleChannelLocationId: draft.saleChannelLocationId,
        isBackOrder: draft.isBackOrder,
        shipToLocationName: draft.shipToLocationName,
        shipToRecipientName: draft.shipToRecipientName,
        shipToCompanyName: draft.shipToCompanyName,
        shipToPhoneNumber: draft.shipToPhoneNumber,
        shipToEmail: draft.shipToEmail,
        shipToAddressLine1: draft.shipToAddressLine1,
        shipToAddressLine2: draft.shipToAddressLine2,
        shipToCity: draft.shipToCity,
        shipToStateProvince: draft.shipToStateProvince,
        shipToPostalCode: draft.shipToPostalCode,
        shipToCountry: draft.shipToCountry,
        shipToNotes: draft.shipToNotes,
        storeId: draft.storeId,
        createdById: draft.createdById,
      },
      select: { id: true },
    });

    if (draft.lines.length > 0) {
      await tx.purchaseOrderLine.createMany({
        data: draft.lines.map((line) => ({
          purchaseOrderId: purchaseOrder.id,
          productId: line.productId,
          quantity: line.quantity,
          orderedQuantity: line.quantity,
          unitCost: line.unitCost,
          unitPrice: line.unitPrice,
          storeId: line.storeId,
          createdById: line.createdById,
        })),
      });
    }

    await tx.draftPurchaseOrder.update({
      where: { id: draft.id },
      data: {
        status: "converted",
        convertedPurchaseOrderId: purchaseOrder.id,
      },
    });

    convertedPurchaseOrderIds.push(purchaseOrder.id);
  }

  return { convertedPurchaseOrderIds };
}
