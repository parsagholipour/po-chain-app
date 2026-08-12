import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { convertPaidDistributorInvoiceDrafts } from "@/lib/distributor-orders/finalize";
import { moneyToCents } from "@/lib/distributor-orders/money";
import { createPaymentStatusNotifications } from "@/lib/notification-events";
import { SHOPIFY_PROVIDER } from "@/lib/payments/providers";

/**
 * Thrown only where nothing should persist, so the caller can map them to a terminal
 * response. Matches the string-sentinel convention in the Stripe webhook route.
 */
export const SHOPIFY_WEBHOOK_ATTEMPT_NOT_FOUND = "SHOPIFY_WEBHOOK_ATTEMPT_NOT_FOUND";
export const SHOPIFY_WEBHOOK_STORE_MISMATCH = "SHOPIFY_WEBHOOK_STORE_MISMATCH";

export type ShopifyPaidOrder = {
  /** `gid://shopify/Order/…` */
  gid: string;
  name: string | null;
  totalCents: number | null;
  currency: string | null;
};

export type ShopifyPaidAttempt = {
  id: string;
  storeId: string;
  invoiceId: string;
  status: string;
  amount: Prisma.Decimal | string | number;
  currency: string;
  providerMetadata: Prisma.JsonValue | null;
};

export type ApplyShopifyOrderPaidResult =
  | { outcome: "duplicate"; notificationIds: string[] }
  | { outcome: "already_paid"; notificationIds: string[] }
  | { outcome: "underpaid"; notificationIds: string[] }
  | { outcome: "converted"; notificationIds: string[]; overpaidCents: number };

function metadataObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

/**
 * The single place a Shopify payment turns into purchase orders. Shared by the `orders/paid`
 * webhook and the recovery sweeper so a lost webhook and the happy path can never diverge.
 *
 * Must run inside a transaction: `PaymentWebhookEvent`'s `@@unique([provider, providerEventId])`
 * is the idempotency claim for the whole unit of work.
 */
export async function applyShopifyOrderPaid({
  tx,
  paymentAttempt,
  order,
  providerEventId,
  eventType,
  payload,
}: {
  tx: Prisma.TransactionClient;
  paymentAttempt: ShopifyPaidAttempt;
  order: ShopifyPaidOrder;
  providerEventId: string;
  eventType: string;
  payload?: Prisma.InputJsonValue;
}): Promise<ApplyShopifyOrderPaidResult> {
  const existingEvent = await tx.paymentWebhookEvent.findUnique({
    where: {
      provider_providerEventId: {
        provider: SHOPIFY_PROVIDER,
        providerEventId,
      },
    },
    select: { id: true },
  });
  if (existingEvent) return { outcome: "duplicate", notificationIds: [] };

  const invoice = await tx.invoice.findFirst({
    where: { id: paymentAttempt.invoiceId, purpose: "distributor_order" },
    select: { id: true, storeId: true, currency: true, paymentStatus: true },
  });
  if (!invoice) throw new Error(SHOPIFY_WEBHOOK_ATTEMPT_NOT_FOUND);
  if (invoice.storeId !== paymentAttempt.storeId) {
    throw new Error(SHOPIFY_WEBHOOK_STORE_MISMATCH);
  }

  await tx.paymentWebhookEvent.create({
    data: {
      provider: SHOPIFY_PROVIDER,
      providerEventId,
      type: eventType,
      paymentAttemptId: paymentAttempt.id,
      invoiceId: invoice.id,
      storeId: invoice.storeId,
      payload,
    },
  });

  // Already-converted invoices still record the event above so Shopify stops retrying.
  if (paymentAttempt.status === "paid" && invoice.paymentStatus === "paid") {
    return { outcome: "already_paid", notificationIds: [] };
  }

  const expectedCents = moneyToCents(paymentAttempt.amount) ?? 0;
  const paidCents = order.totalCents;
  const orderCurrency = order.currency?.trim().toLowerCase() || null;
  const attemptCurrency = paymentAttempt.currency.trim().toLowerCase();

  const currencyMismatch = Boolean(orderCurrency && orderCurrency !== attemptCurrency);
  const underpaid = paidCents == null || paidCents < expectedCents;

  if (currencyMismatch || underpaid) {
    const failureMessage = currencyMismatch
      ? `Shopify charged in ${order.currency} but this order was priced in ${attemptCurrency.toUpperCase()}`
      : `Shopify collected ${((paidCents ?? 0) / 100).toFixed(2)} but the invoice total is ${(
          expectedCents / 100
        ).toFixed(2)}`;

    await tx.paymentAttempt.update({
      where: { id: paymentAttempt.id },
      data: {
        status: "failed",
        providerPaymentIntentId: order.gid,
        failureMessage,
        providerMetadata: {
          ...metadataObject(paymentAttempt.providerMetadata),
          shopifyOrderGid: order.gid,
          shopifyOrderName: order.name,
          paidCents: paidCents ?? null,
          expectedCents,
          failureReason: currencyMismatch ? "currency_mismatch" : "underpaid",
        },
      },
    });

    if (invoice.paymentStatus !== "paid") {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paymentStatus: "failed" },
      });
    }

    // Deliberately returns instead of throwing: the webhook-event row must commit so
    // Shopify's retries are swallowed as duplicates. A permanent failure must never burn
    // the 8-consecutive-failure budget that auto-deletes the subscription.
    const notificationIds = await createPaymentStatusNotifications(tx, {
      storeId: invoice.storeId,
      invoiceId: invoice.id,
      providerEventId,
      paymentStatus: "failed",
    });
    return { outcome: "underpaid", notificationIds };
  }

  const overpaidCents = (paidCents ?? expectedCents) - expectedCents;

  await tx.paymentAttempt.update({
    where: { id: paymentAttempt.id },
    data: {
      status: "paid",
      providerPaymentIntentId: order.gid,
      failureMessage: null,
      providerMetadata: {
        ...metadataObject(paymentAttempt.providerMetadata),
        shopifyOrderGid: order.gid,
        shopifyOrderName: order.name,
        paidCents: paidCents ?? expectedCents,
        expectedCents,
        ...(overpaidCents > 0 ? { overpaidCents } : {}),
      },
    },
  });

  const conversion = await convertPaidDistributorInvoiceDrafts({ tx, invoiceId: invoice.id });
  return {
    outcome: "converted",
    notificationIds: conversion.notificationIds,
    overpaidCents,
  };
}
