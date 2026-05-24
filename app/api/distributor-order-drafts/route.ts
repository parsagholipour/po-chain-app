import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { distributorOrderInvoiceNumber } from "@/lib/distributor-orders/invoice-number";
import {
  DEFAULT_PAYMENT_CURRENCY,
  centsToMoney,
  moneyToCents,
} from "@/lib/distributor-orders/money";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { createExternalOrderNotifications } from "@/lib/notification-events";
import { dispatchNotificationEmailsSafely } from "@/lib/notifications";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import {
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";
import { getStripeCredentialsForStore } from "@/lib/payments/stripe-settings";
import { PaymentProviderConfigError } from "@/lib/payments/types";
import { saleChannelLocationCreateSchema } from "@/lib/validations/master-data";

export const runtime = "nodejs";

const quantityInputSchema = z.object({
  saleChannelLocationId: z.uuid().optional(),
  sessionLocation: saleChannelLocationCreateSchema.extend({ id: z.uuid() }).optional(),
  quantity: z.number().int().nonnegative(),
  backOrderQuantity: z.number().int().nonnegative().default(0),
}).refine(
  (value) => Boolean(value.saleChannelLocationId) !== Boolean(value.sessionLocation),
  "Provide either a saved location id or a session location",
);

const lineInputSchema = z.object({
  productId: z.uuid(),
  quantities: z.array(quantityInputSchema).min(1),
});

const documentInputSchema = z.object({
  saleChannelLocationId: z.uuid().optional(),
  destinationKey: z.string().trim().min(1).max(160).optional(),
  documentKey: z.string().min(1).nullable().optional(),
}).refine(
  (value) => Boolean(value.saleChannelLocationId) !== Boolean(value.destinationKey),
  "Provide either a saved location id or a destination key",
);

const purchaseOrderNameInputSchema = z.object({
  saleChannelLocationId: z.uuid().optional(),
  destinationKey: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().max(120).optional(),
}).refine(
  (value) => Boolean(value.saleChannelLocationId) !== Boolean(value.destinationKey),
  "Provide either a saved location id or a destination key",
);

const bodySchema = z.object({
  lines: z.array(lineInputSchema).min(1),
  purchaseOrderNames: z.array(purchaseOrderNameInputSchema).default([]),
  documents: z.array(documentInputSchema).default([]),
});

type ProductPricing = {
  id: string;
  name: string;
  sku: string;
  costCents: number | null;
  priceCents: number;
};

type DestinationSnapshot = {
  destinationKey: string;
  saleChannelLocationId: string | null;
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
};

function assertDistributorDocumentKey(documentKey: string | null | undefined) {
  if (!documentKey) return;
  if (!documentKey.startsWith("new-orders/")) {
    throw new Error("INVALID_DOCUMENT_KEY");
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function savedDestinationKey(saleChannelLocationId: string) {
  return `location:${saleChannelLocationId}`;
}

function sessionDestinationKey(sessionLocationId: string) {
  return `session:${sessionLocationId}`;
}

function inputDestinationKey(value: {
  saleChannelLocationId?: string;
  destinationKey?: string;
}) {
  return value.saleChannelLocationId
    ? savedDestinationKey(value.saleChannelLocationId)
    : value.destinationKey!;
}

function snapshotData(destination: DestinationSnapshot) {
  return {
    destinationKey: destination.destinationKey,
    saleChannelLocationId: destination.saleChannelLocationId,
    shipToLocationName: destination.name,
    shipToRecipientName: destination.recipientName,
    shipToCompanyName: destination.companyName,
    shipToPhoneNumber: destination.phoneNumber,
    shipToEmail: destination.email,
    shipToAddressLine1: destination.addressLine1,
    shipToAddressLine2: destination.addressLine2,
    shipToCity: destination.city,
    shipToStateProvince: destination.stateProvince,
    shipToPostalCode: destination.postalCode,
    shipToCountry: destination.country,
    shipToNotes: destination.shippingNotes,
  };
}

function purchaseOrderSnapshotData(destination: DestinationSnapshot) {
  return {
    saleChannelLocationId: destination.saleChannelLocationId,
    shipToLocationName: destination.name,
    shipToRecipientName: destination.recipientName,
    shipToCompanyName: destination.companyName,
    shipToPhoneNumber: destination.phoneNumber,
    shipToEmail: destination.email,
    shipToAddressLine1: destination.addressLine1,
    shipToAddressLine2: destination.addressLine2,
    shipToCity: destination.city,
    shipToStateProvince: destination.stateProvince,
    shipToPostalCode: destination.postalCode,
    shipToCountry: destination.country,
    shipToNotes: destination.shippingNotes,
  };
}

export async function POST(request: Request) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  if (!isDistributorContext(authz.context)) {
    return jsonError("Only distributor accounts can create distributor order drafts", 403);
  }

  const { userId, storeId, saleChannelId: saleChannelIdFromContext } = authz.context;
  if (!saleChannelIdFromContext) {
    return jsonError("Distributor account is not linked to a sale channel", 403);
  }
  const saleChannelId = saleChannelIdFromContext;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const saleChannelPaymentType = await prisma.saleChannel.findFirst({
      where: { id: saleChannelId, storeId, type: { in: ["distributor", "store"] } },
      select: { type: true },
    });
    if (!saleChannelPaymentType) {
      return jsonError("Sale channel was not found", 400);
    }

    const paymentCurrency =
      saleChannelPaymentType.type === "store"
        ? (await getStripeCredentialsForStore(storeId)).currency
        : DEFAULT_PAYMENT_CURRENCY;

    for (const doc of parsed.data.documents) {
      assertDistributorDocumentKey(doc.documentKey);
    }

    const productIds = parsed.data.lines.map((line) => line.productId);
    if (uniqueValues(productIds).length !== productIds.length) {
      return jsonError("Each product can only appear once on a distributor order", 400);
    }

    const quantitySavedLocationIds = parsed.data.lines.flatMap((line) =>
      line.quantities.flatMap((qty) => (qty.saleChannelLocationId ? [qty.saleChannelLocationId] : [])),
    );
    const documentSavedLocationIds = parsed.data.documents.flatMap((doc) =>
      doc.saleChannelLocationId ? [doc.saleChannelLocationId] : [],
    );
    const namedSavedLocationIds = parsed.data.purchaseOrderNames.flatMap((poName) =>
      poName.saleChannelLocationId ? [poName.saleChannelLocationId] : [],
    );
    const requestedSavedLocationIds = uniqueValues([
      ...quantitySavedLocationIds,
      ...documentSavedLocationIds,
      ...namedSavedLocationIds,
    ]);
    const hasSessionLocations = parsed.data.lines.some((line) =>
      line.quantities.some((qty) => qty.sessionLocation),
    );

    const result = await prisma.$transaction(async (tx) => {
      const saleChannel = await tx.saleChannel.findFirst({
        where: { id: saleChannelId, storeId, type: { in: ["distributor", "store"] } },
        select: { id: true, name: true, email: true, type: true },
      });
      if (!saleChannel) {
        throw new Error("SALE_CHANNEL_NOT_FOUND");
      }
      if (saleChannel.type !== "store" && hasSessionLocations) {
        throw new Error("SESSION_LOCATION_NOT_ALLOWED");
      }
      if (saleChannel.type === "store" && requestedSavedLocationIds.length > 0) {
        throw new Error("SAVED_LOCATION_NOT_ALLOWED");
      }

      const locations = await tx.saleChannelLocation.findMany({
        where: {
          id: { in: requestedSavedLocationIds },
          storeId,
          saleChannelId,
        },
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
        },
      });
      if (locations.length !== requestedSavedLocationIds.length) {
        throw new Error("LOCATION_NOT_FOUND");
      }

      const destinationByKey = new Map<string, DestinationSnapshot>();
      for (const location of locations) {
        destinationByKey.set(savedDestinationKey(location.id), {
          destinationKey: savedDestinationKey(location.id),
          saleChannelLocationId: location.id,
          name: location.name,
          recipientName: location.recipientName,
          companyName: location.companyName,
          phoneNumber: location.phoneNumber,
          email: location.email,
          addressLine1: location.addressLine1,
          addressLine2: location.addressLine2,
          city: location.city,
          stateProvince: location.stateProvince,
          postalCode: location.postalCode,
          country: location.country,
          shippingNotes: location.shippingNotes,
        });
      }

      for (const line of parsed.data.lines) {
        for (const qty of line.quantities) {
          if (!qty.sessionLocation) continue;
          const key = sessionDestinationKey(qty.sessionLocation.id);
          if (destinationByKey.has(key)) continue;
          destinationByKey.set(key, {
            destinationKey: key,
            saleChannelLocationId: null,
            name: qty.sessionLocation.name,
            recipientName: qty.sessionLocation.recipientName,
            companyName: qty.sessionLocation.companyName ?? null,
            phoneNumber: qty.sessionLocation.phoneNumber ?? null,
            email: qty.sessionLocation.email ?? null,
            addressLine1: qty.sessionLocation.addressLine1,
            addressLine2: qty.sessionLocation.addressLine2 ?? null,
            city: qty.sessionLocation.city,
            stateProvince: qty.sessionLocation.stateProvince ?? null,
            postalCode: qty.sessionLocation.postalCode ?? null,
            country: qty.sessionLocation.country,
            shippingNotes: qty.sessionLocation.shippingNotes ?? null,
          });
        }
      }

      const products = await tx.product.findMany({
        where: { id: { in: productIds }, storeId },
        select: { id: true, name: true, sku: true, cost: true, price: true },
      });
      if (products.length !== productIds.length) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const productMap = new Map<string, ProductPricing>();
      for (const product of products) {
        const priceCents = moneyToCents(product.price);
        if (priceCents == null || priceCents <= 0) {
          throw new Error(`MISSING_PRICE:${product.sku}:${product.name}`);
        }
        productMap.set(product.id, {
          id: product.id,
          name: product.name,
          sku: product.sku,
          costCents: moneyToCents(product.cost),
          priceCents,
        });
      }

      const activeLinesByDestination = new Map<
        string,
        Array<{
          product: ProductPricing;
          quantity: number;
          lineTotalCents: number;
        }>
      >();
      const activeBackOrderLinesByDestination = new Map<
        string,
        Array<{
          product: ProductPricing;
          quantity: number;
          lineTotalCents: number;
        }>
      >();
      let totalCents = 0;

      for (const line of parsed.data.lines) {
        const product = productMap.get(line.productId);
        if (!product) throw new Error("PRODUCT_NOT_FOUND");

        const seenLineDestinationKeys = new Set<string>();
        for (const qty of line.quantities) {
          const destinationKey = qty.saleChannelLocationId
            ? savedDestinationKey(qty.saleChannelLocationId)
            : sessionDestinationKey(qty.sessionLocation!.id);
          if (seenLineDestinationKeys.has(destinationKey)) {
            throw new Error("DUPLICATE_LOCATION_QUANTITY");
          }
          seenLineDestinationKeys.add(destinationKey);
          const regularQuantity = qty.quantity;
          const backOrderQuantity = qty.backOrderQuantity;
          if (regularQuantity <= 0 && backOrderQuantity <= 0) continue;
          if (!destinationByKey.has(destinationKey)) {
            throw new Error("LOCATION_NOT_FOUND");
          }

          if (regularQuantity > 0) {
            const lineTotalCents = product.priceCents * regularQuantity;
            const destinationLines = activeLinesByDestination.get(destinationKey) ?? [];
            destinationLines.push({ product, quantity: regularQuantity, lineTotalCents });
            activeLinesByDestination.set(destinationKey, destinationLines);
            totalCents += lineTotalCents;
          }
          if (backOrderQuantity > 0) {
            const lineTotalCents = product.priceCents * backOrderQuantity;
            const destinationLines =
              activeBackOrderLinesByDestination.get(destinationKey) ?? [];
            destinationLines.push({ product, quantity: backOrderQuantity, lineTotalCents });
            activeBackOrderLinesByDestination.set(destinationKey, destinationLines);
            totalCents += lineTotalCents;
          }
        }
      }

      if (
        (activeLinesByDestination.size === 0 &&
          activeBackOrderLinesByDestination.size === 0) ||
        totalCents <= 0
      ) {
        throw new Error("NO_ACTIVE_QUANTITIES");
      }

      const activeDestinationKeys = new Set([
        ...activeLinesByDestination.keys(),
        ...activeBackOrderLinesByDestination.keys(),
      ]);
      const purchaseOrderNameByDestinationKey = new Map<string, string>();
      for (const poName of parsed.data.purchaseOrderNames) {
        const destinationKey = inputDestinationKey(poName);
        if (!activeDestinationKeys.has(destinationKey)) {
          throw new Error("PURCHASE_ORDER_NAME_LOCATION_INACTIVE");
        }
        if (purchaseOrderNameByDestinationKey.has(destinationKey)) {
          throw new Error("DUPLICATE_PURCHASE_ORDER_NAME");
        }
        const name = poName.name?.trim();
        if (name) {
          purchaseOrderNameByDestinationKey.set(destinationKey, name);
        }
      }

      const documentByDestinationKey = new Map<string, string | null>();
      for (const doc of parsed.data.documents) {
        const destinationKey = inputDestinationKey(doc);
        if (!activeDestinationKeys.has(destinationKey)) {
          throw new Error("DOCUMENT_LOCATION_INACTIVE");
        }
        documentByDestinationKey.set(destinationKey, doc.documentKey ?? null);
      }

      const invoiceNumber = distributorOrderInvoiceNumber();
      const generatedOrderBaseName = `Distributor order ${invoiceNumber}`;

      function purchaseOrderNameForDestination(
        destination: DestinationSnapshot,
        isBackOrder: boolean,
      ) {
        const name =
          purchaseOrderNameByDestinationKey.get(destination.destinationKey) ??
          `${generatedOrderBaseName} - ${destination.name}`;
        return isBackOrder ? `${name} - Back Order` : name;
      }

      if (saleChannel.type === "distributor") {
        const purchaseOrders: Array<{
          id: string;
          number: number;
          name: string;
          status: string;
          saleChannelLocationId: string | null;
          shipToLocationName: string | null;
          isBackOrder: boolean;
        }> = [];
        const notificationIds: string[] = [];

        async function createPurchaseOrdersForLines(
          linesByDestination: typeof activeLinesByDestination,
          isBackOrder: boolean,
        ) {
          for (const [destinationKey, destinationLines] of linesByDestination) {
            const destination = destinationByKey.get(destinationKey);
            if (!destination) throw new Error("LOCATION_NOT_FOUND");

            const purchaseOrder = await tx.purchaseOrder.create({
              data: {
                name: purchaseOrderNameForDestination(destination, isBackOrder),
                type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
                status: "open",
                documentKey: documentByDestinationKey.get(destinationKey) ?? null,
                saleChannelId,
                isBackOrder,
                ...purchaseOrderSnapshotData(destination),
                storeId,
                createdById: userId,
              },
              select: {
                id: true,
                number: true,
                name: true,
                status: true,
                saleChannelId: true,
                saleChannelLocationId: true,
                shipToLocationName: true,
                isBackOrder: true,
              },
            });

            await tx.purchaseOrderLine.createMany({
              data: destinationLines.map((line) => ({
                purchaseOrderId: purchaseOrder.id,
                productId: line.product.id,
                quantity: line.quantity,
                orderedQuantity: line.quantity,
                unitCost:
                  line.product.costCents == null ? null : centsToMoney(line.product.costCents),
                unitPrice: centsToMoney(line.product.priceCents),
                storeId,
                createdById: userId,
              })),
            });

            purchaseOrders.push({
              id: purchaseOrder.id,
              number: purchaseOrder.number,
              name: purchaseOrder.name,
              status: purchaseOrder.status,
              saleChannelLocationId: purchaseOrder.saleChannelLocationId,
              shipToLocationName: purchaseOrder.shipToLocationName,
              isBackOrder: purchaseOrder.isBackOrder,
            });
            notificationIds.push(
              ...(await createExternalOrderNotifications(tx, {
                storeId,
                createdById: userId,
                purchaseOrder,
              })),
            );
          }
        }

        await createPurchaseOrdersForLines(activeLinesByDestination, false);
        await createPurchaseOrdersForLines(activeBackOrderLinesByDestination, true);

        return {
          type: "purchase_orders" as const,
          purchaseOrders,
          convertedPurchaseOrderIds: purchaseOrders.map((po) => po.id),
          notificationIds,
        };
      }

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          purpose: "distributor_order",
          paymentStatus: "unpaid",
          currency: paymentCurrency,
          subtotalAmount: centsToMoney(totalCents),
          totalAmount: centsToMoney(totalCents),
          storeId,
          createdById: userId,
        },
        select: {
          id: true,
          invoiceNumber: true,
          paymentStatus: true,
          currency: true,
          totalAmount: true,
        },
      });

      const drafts: Array<{
        id: string;
        destinationKey: string;
        saleChannelLocationId: string | null;
        name: string;
        documentKey: string | null;
        isBackOrder: boolean;
      }> = [];

      async function createDraftsForLines(
        linesByDestination: typeof activeLinesByDestination,
        isBackOrder: boolean,
      ) {
        for (const [destinationKey, destinationLines] of linesByDestination) {
          const destination = destinationByKey.get(destinationKey);
          if (!destination) throw new Error("LOCATION_NOT_FOUND");
          const draft = await tx.draftPurchaseOrder.create({
            data: {
              name: purchaseOrderNameForDestination(destination, isBackOrder),
              invoiceId: invoice.id,
              saleChannelId,
              isBackOrder,
              ...snapshotData(destination),
              documentKey: documentByDestinationKey.get(destinationKey) ?? null,
              storeId,
              createdById: userId,
            },
            select: {
              id: true,
              name: true,
              destinationKey: true,
              saleChannelLocationId: true,
              documentKey: true,
              isBackOrder: true,
            },
          });

          await tx.draftPurchaseOrderLine.createMany({
            data: destinationLines.map((line) => ({
              draftPurchaseOrderId: draft.id,
              productId: line.product.id,
              quantity: line.quantity,
              unitCost:
                line.product.costCents == null ? null : centsToMoney(line.product.costCents),
              unitPrice: centsToMoney(line.product.priceCents),
              lineTotal: centsToMoney(line.lineTotalCents),
              storeId,
              createdById: userId,
            })),
          });

          drafts.push(draft);
        }
      }

      await createDraftsForLines(activeLinesByDestination, false);
      await createDraftsForLines(activeBackOrderLinesByDestination, true);

      return { type: "invoice_drafts" as const, invoice, drafts };
    });

    if (result.type === "purchase_orders") {
      await dispatchNotificationEmailsSafely(result.notificationIds);
      return NextResponse.json(
        {
          purchaseOrders: result.purchaseOrders,
          convertedPurchaseOrderIds: result.convertedPurchaseOrderIds,
        },
        { status: 201 },
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof PaymentProviderConfigError) {
      return jsonError(e.message, 503);
    }
    if (e instanceof Error) {
      if (e.message === "INVALID_DOCUMENT_KEY") {
        return jsonError("Distributor order documents must be uploaded from the New Order flow", 400);
      }
      if (e.message === "SALE_CHANNEL_NOT_FOUND") {
        return jsonError("Sale channel was not found", 400);
      }
      if (e.message === "SESSION_LOCATION_NOT_ALLOWED") {
        return jsonError("Temporary session locations are only available to store magic-link accounts", 400);
      }
      if (e.message === "SAVED_LOCATION_NOT_ALLOWED") {
        return jsonError("Store magic-link accounts must use temporary session locations", 400);
      }
      if (e.message === "LOCATION_NOT_FOUND") {
        return jsonError("One or more locations were not found", 400);
      }
      if (e.message === "PRODUCT_NOT_FOUND") {
        return jsonError("One or more products were not found", 400);
      }
      if (e.message === "DUPLICATE_LOCATION_QUANTITY") {
        return jsonError("Each product can only have one quantity per location", 400);
      }
      if (e.message === "NO_ACTIVE_QUANTITIES") {
        return jsonError("Enter a quantity for at least one product and location", 400);
      }
      if (e.message === "DOCUMENT_LOCATION_INACTIVE") {
        return jsonError("Documents can only be attached to locations with active quantities", 400);
      }
      if (e.message === "PURCHASE_ORDER_NAME_LOCATION_INACTIVE") {
        return jsonError("PO names can only be set for locations with active quantities", 400);
      }
      if (e.message === "DUPLICATE_PURCHASE_ORDER_NAME") {
        return jsonError("Each location can only have one PO name", 400);
      }
      if (e.message.startsWith("MISSING_PRICE:")) {
        const [, sku, name] = e.message.split(":");
        return jsonError(`Product ${sku} - ${name} does not have a valid price`, 400);
      }
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
