import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { centsToMoney, moneyToCents } from "@/lib/distributor-orders/money";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import {
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";
import { createStripeCheckoutSession, STRIPE_PROVIDER } from "@/lib/payments/stripe";
import {
  PaymentProviderConfigError,
  PaymentProviderError,
  type CheckoutLineItem,
} from "@/lib/payments/types";
import { getStripeCredentialsForStore } from "@/lib/payments/stripe-settings";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

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
              product: { select: { id: true, name: true, sku: true } },
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

  let stripeCredentials: Awaited<ReturnType<typeof getStripeCredentialsForStore>>;
  try {
    stripeCredentials = await getStripeCredentialsForStore(storeId);
  } catch (e) {
    if (e instanceof PaymentProviderConfigError) {
      return jsonError(e.message, 503);
    }
    throw e;
  }

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
          Array.from(lineItemByProduct.values()),
        ),
        successUrl,
        cancelUrl,
        customerEmail: invoice.draftPurchaseOrders[0]?.saleChannel.email ?? null,
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
    await prisma.paymentAttempt.update({
      where: { id: paymentAttempt.id },
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
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
