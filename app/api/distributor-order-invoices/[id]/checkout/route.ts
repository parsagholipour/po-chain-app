import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  centsToMoney,
  moneyToCents,
  normalizeCurrency,
} from "@/lib/distributor-orders/money";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import {
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";
import { createStripeCheckoutSession, STRIPE_PROVIDER } from "@/lib/payments/stripe";
import { SHOPIFY_PROVIDER } from "@/lib/payments/providers";
import { resolveStoreCheckoutProvider } from "@/lib/payments/checkout-provider";
import {
  PaymentProviderConfigError,
  PaymentProviderError,
  type CheckoutLineItem,
} from "@/lib/payments/types";
import { deleteShopifyDraftOrder, ShopifyApiError } from "@/lib/shopify/admin";
import {
  createShopifyDraftOrderCheckout,
  type ShopifyCheckoutDestination,
} from "@/lib/shopify/checkout";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

const SHOPIFY_MAX_DRAFT_ORDER_LINES = 250;

function appOrigin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    new URL(request.url).origin
  ).replace(/\/$/, "");
}

function compactCheckoutLineItems(
  invoiceNumber: string,
  amountCents: number,
  lineItems: CheckoutLineItem[],
): CheckoutLineItem[] {
  if (lineItems.length <= 90) return lineItems;
  return [
    {
      name: `Distributor order ${invoiceNumber}`,
      sku: null,
      quantity: 1,
      unitAmountCents: amountCents,
    },
  ];
}

async function failCheckoutAttempt(paymentAttemptId: string, e: unknown) {
  await prisma.paymentAttempt.update({
    where: { id: paymentAttemptId },
    data: {
      status: "failed",
      failureMessage: e instanceof Error ? e.message : "Could not create checkout session",
    },
  });

  if (e instanceof PaymentProviderConfigError) {
    return jsonError(e.message, 503);
  }
  if (e instanceof PaymentProviderError) {
    return jsonError(e.message, 400);
  }
  if (e instanceof ShopifyApiError) {
    return jsonError(e.message, 502);
  }
  const j = jsonFromPrisma(e);
  if (j) return j;
  throw e;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  if (!isDistributorContext(authz.context)) {
    return jsonError("Only distributor accounts can start distributor order checkout", 403);
  }

  const { storeId, userId, saleChannelId } = authz.context;
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
    include: {
      draftPurchaseOrders: {
        where: { saleChannelId },
        include: {
          saleChannel: { select: { email: true, type: true } },
          lines: {
            include: {
              product: { select: { id: true, name: true, sku: true, editingStatus: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!invoice) return jsonError("Not found", 404);
  if (invoice.paymentStatus === "paid") {
    return jsonError("This invoice has already been paid", 409);
  }
  if (invoice.draftPurchaseOrders.length === 0) {
    return jsonError("This invoice has no draft purchase orders", 400);
  }
  if (invoice.draftPurchaseOrders.some((draft) => draft.saleChannel.type !== "store")) {
    return jsonError("Only store orders can be paid at checkout", 400);
  }

  const amountCents = moneyToCents(invoice.totalAmount);
  if (amountCents == null || amountCents <= 0) {
    return jsonError("Invoice total must be greater than zero", 400);
  }

  const lineItemByProduct = new Map<string, CheckoutLineItem>();
  for (const draft of invoice.draftPurchaseOrders) {
    for (const line of draft.lines) {
      if (line.product.editingStatus === "discontinued") {
        return jsonError(
          `Product ${line.product.sku} - ${line.product.name} is discontinued and can no longer be ordered`,
          400,
        );
      }
      const unitAmountCents = moneyToCents(line.unitPrice);
      if (unitAmountCents == null || unitAmountCents <= 0) {
        return jsonError(`Product ${line.product.sku} does not have a valid price`, 400);
      }
      const existing = lineItemByProduct.get(line.productId);
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        lineItemByProduct.set(line.productId, {
          name: line.product.name,
          sku: line.product.sku,
          quantity: line.quantity,
          unitAmountCents,
        });
      }
    }
  }

  const origin = appOrigin(request);
  const successUrl = `${origin}/new-order/success?invoiceId=${invoice.id}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/new-order/cancelled?invoiceId=${invoice.id}`;

  // A second "Pay" click must reuse the live checkout instead of creating a second one.
  const pendingAttempt = await prisma.paymentAttempt.findFirst({
    where: {
      storeId,
      invoiceId: invoice.id,
      status: "pending",
      checkoutUrl: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, provider: true, checkoutUrl: true },
  });
  if (pendingAttempt?.checkoutUrl) {
    return NextResponse.json({
      provider: pendingAttempt.provider,
      checkoutUrl: pendingAttempt.checkoutUrl,
      paymentAttemptId: pendingAttempt.id,
    });
  }

  let resolved: Awaited<ReturnType<typeof resolveStoreCheckoutProvider>>;
  try {
    resolved = await resolveStoreCheckoutProvider(storeId);
  } catch (e) {
    if (e instanceof PaymentProviderConfigError) {
      return jsonError(e.message, 503);
    }
    throw e;
  }

  if (normalizeCurrency(invoice.currency) !== resolved.currency) {
    return jsonError(
      `This order was priced in ${invoice.currency.toUpperCase()} but checkout now charges in ${resolved.currency.toUpperCase()}. Start a new order.`,
      409,
    );
  }

  const checkoutLineItems = Array.from(lineItemByProduct.values());
  const customerEmail = invoice.draftPurchaseOrders[0]?.saleChannel.email ?? null;

  if (resolved.provider === SHOPIFY_PROVIDER) {
    // Compacting the lines away would destroy the SKU -> variant matching, so cap instead.
    if (checkoutLineItems.length > SHOPIFY_MAX_DRAFT_ORDER_LINES) {
      return jsonError(
        `This order has too many distinct products for Shopify checkout (max ${SHOPIFY_MAX_DRAFT_ORDER_LINES}).`,
        400,
      );
    }

    const destinations: ShopifyCheckoutDestination[] = invoice.draftPurchaseOrders.map(
      (draft) => ({
        label: draft.name,
        isBackOrder: draft.isBackOrder,
        recipientName: draft.shipToRecipientName,
        companyName: draft.shipToCompanyName,
        phone: draft.shipToPhoneNumber,
        email: draft.shipToEmail,
        addressLine1: draft.shipToAddressLine1,
        addressLine2: draft.shipToAddressLine2,
        city: draft.shipToCity,
        stateProvince: draft.shipToStateProvince,
        postalCode: draft.shipToPostalCode,
        country: draft.shipToCountry,
        lines: draft.lines.map((line) => ({
          name: line.product.name,
          sku: line.product.sku,
          quantity: line.quantity,
        })),
      }),
    );

    const correlationToken = randomBytes(32).toString("hex");
    // Created before the Shopify call so an orphaned draft order is always recoverable.
    const shopifyAttempt = await prisma.paymentAttempt.create({
      data: {
        provider: SHOPIFY_PROVIDER,
        status: "created",
        amount: centsToMoney(amountCents),
        currency: invoice.currency,
        correlationToken,
        invoiceId: invoice.id,
        storeId,
        createdById: userId,
      },
      select: { id: true },
    });

    let createdDraftOrderId: string | null = null;
    try {
      const checkout = await createShopifyDraftOrderCheckout({
        shopDomain: resolved.shopify.shopDomain,
        accessToken: resolved.shopify.accessToken,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        storeId,
        paymentAttemptId: shopifyAttempt.id,
        correlationToken,
        amountCents,
        currency: invoice.currency,
        lineItems: checkoutLineItems,
        customerEmail,
        destinations,
      });
      createdDraftOrderId = checkout.draftOrderId;

      await prisma.$transaction([
        prisma.paymentAttempt.update({
          where: { id: shopifyAttempt.id },
          data: {
            status: "pending",
            providerSessionId: checkout.draftOrderId,
            checkoutUrl: checkout.checkoutUrl,
            providerMetadata: checkout.metadata as unknown as Prisma.InputJsonValue,
          },
        }),
        prisma.invoice.update({
          where: { id: invoice.id },
          data: { paymentStatus: "pending" },
        }),
      ]);

      return NextResponse.json({
        provider: SHOPIFY_PROVIDER,
        checkoutUrl: checkout.checkoutUrl,
        paymentAttemptId: shopifyAttempt.id,
      });
    } catch (e) {
      // The draft order survived creation but we never persisted its id, so nothing else can
      // reach it — delete it now rather than leave a payable order in the merchant's admin.
      if (createdDraftOrderId) {
        try {
          await deleteShopifyDraftOrder({
            shopDomain: resolved.shopify.shopDomain,
            accessToken: resolved.shopify.accessToken,
            id: createdDraftOrderId,
          });
        } catch (cleanupError) {
          console.error(
            "[shopify-checkout] could not delete an unrecorded draft order",
            createdDraftOrderId,
            cleanupError,
          );
        }
      }
      return await failCheckoutAttempt(shopifyAttempt.id, e);
    }
  }

  const stripeCredentials = resolved.stripe;

  const paymentAttempt = await prisma.paymentAttempt.create({
    data: {
      provider: STRIPE_PROVIDER,
      status: "created",
      amount: centsToMoney(amountCents),
      currency: invoice.currency,
      invoiceId: invoice.id,
      storeId,
      createdById: userId,
    },
    select: { id: true },
  });

  try {
    const checkout = await createStripeCheckoutSession(
      {
        invoiceId: invoice.id,
        paymentAttemptId: paymentAttempt.id,
        amountCents,
        currency: invoice.currency,
        lineItems: compactCheckoutLineItems(
          invoice.invoiceNumber,
          amountCents,
          checkoutLineItems,
        ),
        successUrl,
        cancelUrl,
        customerEmail,
        metadata: {
          invoiceId: invoice.id,
          paymentAttemptId: paymentAttempt.id,
          storeId,
          provider: STRIPE_PROVIDER,
        },
      },
      { secretKey: stripeCredentials.secretKey },
    );

    await prisma.$transaction([
      prisma.paymentAttempt.update({
        where: { id: paymentAttempt.id },
        data: {
          status: "pending",
          providerSessionId: checkout.providerSessionId,
          providerPaymentIntentId: checkout.providerPaymentIntentId,
          checkoutUrl: checkout.checkoutUrl,
        },
      }),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { paymentStatus: "pending" },
      }),
    ]);

    return NextResponse.json({
      provider: STRIPE_PROVIDER,
      checkoutUrl: checkout.checkoutUrl,
      paymentAttemptId: paymentAttempt.id,
    });
  } catch (e) {
    return await failCheckoutAttempt(paymentAttempt.id, e);
  }
}
