import "server-only";

import Stripe from "stripe";
import { STRIPE_PROVIDER } from "@/lib/payments/providers";
import {
  PaymentProviderConfigError,
  PaymentProviderError,
  type CheckoutSessionResult,
  type CreateCheckoutSessionInput,
  type NormalizedPaymentWebhook,
} from "@/lib/payments/types";

export { STRIPE_PROVIDER };

function stripe(secretKey: string) {
  if (!secretKey.trim()) {
    throw new PaymentProviderConfigError("Stripe secret key is required");
  }
  return new Stripe(secretKey);
}

function metadataValue(value: string | null | undefined) {
  return value ?? "";
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const paymentIntent = session.payment_intent;
  if (!paymentIntent) return null;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
}

export async function createStripeCheckoutSession(
  input: CreateCheckoutSessionInput,
  credentials: { secretKey: string },
): Promise<CheckoutSessionResult> {
  if (input.lineItems.length === 0) {
    throw new PaymentProviderError("Checkout requires at least one line item");
  }

  const session = await stripe(credentials.secretKey).checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    client_reference_id: input.invoiceId,
    customer_email: input.customerEmail ?? undefined,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    line_items: input.lineItems.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency: input.currency,
        unit_amount: line.unitAmountCents,
        product_data: {
          name: line.name,
          metadata: line.sku ? { sku: line.sku } : undefined,
        },
      },
    })),
    metadata: input.metadata,
    payment_intent_data: {
      metadata: input.metadata,
    },
  });

  if (!session.url) {
    throw new PaymentProviderError("Stripe did not return a Checkout URL");
  }

  return {
    providerSessionId: session.id,
    providerPaymentIntentId: paymentIntentId(session),
    checkoutUrl: session.url,
  };
}

export function constructStripeWebhookEvent({
  rawBody,
  signature,
  webhookSecret,
}: {
  rawBody: string;
  signature: string | null;
  webhookSecret: string;
}) {
  if (!signature) {
    throw new PaymentProviderError("Missing Stripe-Signature header");
  }
  return Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

export function constructStripeWebhookEventFromCandidates({
  rawBody,
  signature,
  candidates,
}: {
  rawBody: string;
  signature: string | null;
  candidates: Array<{ storeId: string; webhookSecret: string }>;
}) {
  if (!signature) {
    throw new PaymentProviderError("Missing Stripe-Signature header");
  }
  if (candidates.length === 0) {
    throw new PaymentProviderConfigError("No configured Stripe webhook secrets were found");
  }

  let verifiedEvent: Stripe.Event | null = null;
  const verifiedStoreIds: string[] = [];
  for (const candidate of candidates) {
    try {
      const event = constructStripeWebhookEvent({
        rawBody,
        signature,
        webhookSecret: candidate.webhookSecret,
      });
      verifiedEvent ??= event;
      verifiedStoreIds.push(candidate.storeId);
    } catch {
      // Keep trying the remaining store-specific webhook secrets.
    }
  }

  if (!verifiedEvent) {
    throw new PaymentProviderError("Could not verify Stripe webhook signature");
  }

  return { event: verifiedEvent, verifiedStoreIds };
}

export function normalizeStripeWebhookEvent(
  event: Stripe.Event,
): NormalizedPaymentWebhook | null {
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded" &&
    event.type !== "checkout.session.async_payment_failed" &&
    event.type !== "checkout.session.expired"
  ) {
    return null;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = session.metadata ?? {};
  const providerPaymentIntentId = paymentIntentId(session);
  const paymentStatus =
    event.type === "checkout.session.expired"
      ? "expired"
      : event.type === "checkout.session.async_payment_failed"
        ? "failed"
        : session.payment_status === "paid"
          ? "paid"
          : "pending";

  return {
    provider: STRIPE_PROVIDER,
    providerEventId: event.id,
    type: event.type,
    paymentStatus,
    providerSessionId: session.id,
    providerPaymentIntentId,
    invoiceId: metadataValue(metadata.invoiceId) || session.client_reference_id || null,
    paymentAttemptId: metadataValue(metadata.paymentAttemptId) || null,
    storeId: metadataValue(metadata.storeId) || null,
  };
}
