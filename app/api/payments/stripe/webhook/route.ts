import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { convertPaidDistributorInvoiceDrafts } from "@/lib/distributor-orders/finalize";
import { createPaymentStatusNotifications } from "@/lib/notification-events";
import { dispatchNotificationEmailsSafely } from "@/lib/notifications";
import {
  constructStripeWebhookEventFromCandidates,
  normalizeStripeWebhookEvent,
} from "@/lib/payments/stripe";
import { listStripeWebhookCredentials } from "@/lib/payments/stripe-settings";
import {
  PaymentProviderConfigError,
  PaymentProviderError,
  type NormalizedPaymentWebhook,
} from "@/lib/payments/types";

export const runtime = "nodejs";

function invoiceStatusForWebhook(normalized: NormalizedPaymentWebhook) {
  if (normalized.paymentStatus === "paid") return "paid";
  if (normalized.paymentStatus === "failed") return "failed";
  if (normalized.paymentStatus === "expired") return "unpaid";
  if (normalized.paymentStatus === "cancelled") return "cancelled";
  return "pending";
}

function attemptStatusForWebhook(normalized: NormalizedPaymentWebhook) {
  if (normalized.paymentStatus === "expired") return "expired";
  if (normalized.paymentStatus === "cancelled") return "cancelled";
  return normalized.paymentStatus;
}

async function processPaymentWebhook({
  normalized,
  payload,
  verifiedStoreIds,
}: {
  normalized: NormalizedPaymentWebhook;
  payload: Prisma.InputJsonValue;
  verifiedStoreIds: string[];
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: normalized.provider,
          providerEventId: normalized.providerEventId,
        },
      },
      select: { id: true },
    });
    if (existing) return { duplicate: true, notificationIds: [] as string[] };

    const paymentAttempt = normalized.paymentAttemptId
      ? await tx.paymentAttempt.findUnique({
          where: { id: normalized.paymentAttemptId },
          select: { id: true, invoiceId: true, storeId: true },
        })
      : normalized.providerSessionId
        ? await tx.paymentAttempt.findUnique({
            where: { providerSessionId: normalized.providerSessionId },
            select: { id: true, invoiceId: true, storeId: true },
          })
        : null;

    const invoiceId = normalized.invoiceId ?? paymentAttempt?.invoiceId ?? null;
    if (!invoiceId) {
      throw new Error("WEBHOOK_MISSING_INVOICE");
    }

    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, purpose: "distributor_order" },
      select: { id: true, storeId: true, paymentStatus: true },
    });
    if (!invoice) {
      throw new Error("WEBHOOK_INVOICE_NOT_FOUND");
    }
    if (!verifiedStoreIds.includes(invoice.storeId)) {
      throw new Error("WEBHOOK_STORE_NOT_VERIFIED");
    }
    if (normalized.storeId && normalized.storeId !== invoice.storeId) {
      throw new Error("WEBHOOK_STORE_MISMATCH");
    }

    await tx.paymentWebhookEvent.create({
      data: {
        provider: normalized.provider,
        providerEventId: normalized.providerEventId,
        type: normalized.type,
        paymentAttemptId: paymentAttempt?.id ?? null,
        invoiceId: invoice.id,
        storeId: invoice.storeId,
        payload,
      },
    });

    if (paymentAttempt) {
      await tx.paymentAttempt.update({
        where: { id: paymentAttempt.id },
        data: {
          status: attemptStatusForWebhook(normalized),
          providerPaymentIntentId: normalized.providerPaymentIntentId,
        },
      });
    }

    const nextInvoiceStatus = invoiceStatusForWebhook(normalized);
    if (normalized.paymentStatus === "paid") {
      const conversion = await convertPaidDistributorInvoiceDrafts({ tx, invoiceId: invoice.id });
      return { duplicate: false, notificationIds: conversion.notificationIds };
    }

    if (invoice.paymentStatus !== "paid") {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paymentStatus: nextInvoiceStatus },
      });
    }

    const notificationIds =
      normalized.paymentStatus === "failed" || normalized.paymentStatus === "cancelled"
        ? await createPaymentStatusNotifications(tx, {
            storeId: invoice.storeId,
            invoiceId: invoice.id,
            providerEventId: normalized.providerEventId,
            paymentStatus: normalized.paymentStatus,
          })
        : [];

    return { duplicate: false, notificationIds };
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const stripeCredentials = await listStripeWebhookCredentials();
    const { event, verifiedStoreIds } = constructStripeWebhookEventFromCandidates({
      rawBody,
      signature,
      candidates: stripeCredentials,
    });
    const normalized = normalizeStripeWebhookEvent(event);
    if (!normalized) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const payload = JSON.parse(rawBody) as Prisma.InputJsonValue;
    const result = await processPaymentWebhook({ normalized, payload, verifiedStoreIds });
    await dispatchNotificationEmailsSafely(result.notificationIds);
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    if (e instanceof PaymentProviderConfigError) {
      return NextResponse.json({ message: e.message }, { status: 503 });
    }
    if (e instanceof PaymentProviderError) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (
      e instanceof Error &&
      (e.message === "WEBHOOK_MISSING_INVOICE" ||
        e.message === "WEBHOOK_INVOICE_NOT_FOUND" ||
        e.message === "WEBHOOK_STORE_NOT_VERIFIED" ||
        e.message === "WEBHOOK_STORE_MISMATCH" ||
        e.message === "DISTRIBUTOR_ORDER_INVOICE_NOT_FOUND")
    ) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    throw e;
  }
}
