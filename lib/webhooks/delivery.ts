import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { WEBHOOK_TEST_EVENT, type WebhookEvent } from "@/lib/developer-api-constants";
import { decryptWebhookSecret } from "@/lib/webhooks/encryption";
import {
  signWebhookPayload,
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_ENDPOINT_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "@/lib/webhooks/signature";

/**
 * Retry schedule in milliseconds, indexed by the attempt that just failed.
 * Six attempts spread over roughly nine hours; after the last one the delivery
 * is marked failed and can still be replayed by hand from Settings.
 */
const RETRY_BACKOFF_MS = [
  60_000, // 1m
  5 * 60_000, // 5m
  30 * 60_000, // 30m
  2 * 60 * 60_000, // 2h
  6 * 60 * 60_000, // 6h
];
export const WEBHOOK_MAX_ATTEMPTS = RETRY_BACKOFF_MS.length + 1;

/** How long a claimed delivery stays reserved before another worker may retry it. */
const CLAIM_LEASE_MS = 2 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const STORED_RESPONSE_CHARS = 2_000;
const DEFAULT_DISPATCH_LIMIT = 50;

/** An endpoint failing this many times in a row is almost certainly gone. */
const AUTO_DISABLE_AFTER_FAILURES = 20;

export type WebhookEventName = WebhookEvent | typeof WEBHOOK_TEST_EVENT;

type WebhookEnvelope = {
  id: string;
  event: WebhookEventName;
  createdAt: string;
  storeId: string;
  data: unknown;
};

function buildEnvelope({
  deliveryId,
  event,
  storeId,
  data,
}: {
  deliveryId: string;
  event: WebhookEventName;
  storeId: string;
  data: unknown;
}): WebhookEnvelope {
  return {
    id: deliveryId,
    event,
    createdAt: new Date().toISOString(),
    storeId,
    data,
  };
}

/**
 * Queues one delivery row per subscribed endpoint and kicks off an immediate,
 * non-blocking send. Callers never await the HTTP round trip.
 */
export async function enqueueWebhookEvent({
  storeId,
  event,
  data,
}: {
  storeId: string;
  event: WebhookEvent;
  data: unknown;
}) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { storeId, enabled: true, events: { has: event } },
    select: { id: true },
  });
  if (endpoints.length === 0) return [];

  const now = new Date();
  const deliveries = endpoints.map((endpoint) => {
    const deliveryId = randomUUID();
    return {
      id: deliveryId,
      endpointId: endpoint.id,
      event,
      payload: buildEnvelope({ deliveryId, event, storeId, data }) as Prisma.InputJsonValue,
      storeId,
      nextAttemptAt: now,
    };
  });

  await prisma.webhookDelivery.createMany({ data: deliveries });

  const ids = deliveries.map((delivery) => delivery.id);
  void dispatchWebhookDeliveries({ deliveryIds: ids }).catch((error) => {
    console.error("[webhooks] immediate dispatch failed", error);
  });

  return ids;
}

/** Same pipeline as a real event, so a test proves signature + reachability. */
export async function enqueueWebhookTestEvent({
  storeId,
  endpointId,
}: {
  storeId: string;
  endpointId: string;
}) {
  const deliveryId = randomUUID();
  const payload = buildEnvelope({
    deliveryId,
    event: WEBHOOK_TEST_EVENT,
    storeId,
    data: {
      message: "This is a test event from PO App.",
      sentAt: new Date().toISOString(),
    },
  });

  await prisma.webhookDelivery.create({
    data: {
      id: deliveryId,
      endpointId,
      event: WEBHOOK_TEST_EVENT,
      payload: payload as unknown as Prisma.InputJsonValue,
      storeId,
      nextAttemptAt: new Date(),
    },
  });

  await dispatchWebhookDeliveries({ deliveryIds: [deliveryId] });
  return deliveryId;
}

/** Puts a failed or exhausted delivery back on the queue. */
export async function retryWebhookDelivery({
  deliveryId,
  storeId,
}: {
  deliveryId: string;
  storeId: string;
}) {
  const updated = await prisma.webhookDelivery.updateMany({
    where: { id: deliveryId, storeId },
    data: { status: "pending", nextAttemptAt: new Date(), lastError: null },
  });
  if (updated.count === 0) return false;

  await dispatchWebhookDeliveries({ deliveryIds: [deliveryId] });
  return true;
}

type DispatchResult = {
  attempted: number;
  succeeded: number;
  failed: number;
};

const globalForWebhookDispatch = globalThis as typeof globalThis & {
  __webhookDispatchInFlight?: boolean;
};

/**
 * Claims due deliveries and sends them. Safe to call concurrently: each row is
 * claimed with a conditional update before any HTTP request is made.
 */
export async function dispatchWebhookDeliveries({
  deliveryIds,
  limit = DEFAULT_DISPATCH_LIMIT,
}: {
  deliveryIds?: string[];
  limit?: number;
} = {}): Promise<DispatchResult> {
  const now = new Date();
  const due = await prisma.webhookDelivery.findMany({
    where: {
      status: "pending",
      ...(deliveryIds ? { id: { in: deliveryIds } } : {}),
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: { id: true },
  });

  const result: DispatchResult = { attempted: 0, succeeded: 0, failed: 0 };
  const secretCache = new Map<string, string>();

  for (const { id } of due) {
    const outcome = await attemptDelivery(id, secretCache);
    if (outcome === "skipped") continue;
    result.attempted += 1;
    if (outcome === "succeeded") result.succeeded += 1;
    else result.failed += 1;
  }

  return result;
}

/** Serialised entry point for the scheduler so runs never overlap. */
export async function runWebhookDispatchSweep(limit?: number) {
  if (globalForWebhookDispatch.__webhookDispatchInFlight) return null;
  globalForWebhookDispatch.__webhookDispatchInFlight = true;
  try {
    return await dispatchWebhookDeliveries({ limit });
  } finally {
    globalForWebhookDispatch.__webhookDispatchInFlight = false;
  }
}

type AttemptOutcome = "succeeded" | "failed" | "skipped";

async function attemptDelivery(
  deliveryId: string,
  secretCache: Map<string, string>,
): Promise<AttemptOutcome> {
  const now = new Date();

  // Atomic claim: bumping nextAttemptAt into the future stops a second worker
  // from picking up the same row while this request is in flight.
  const claimed = await prisma.webhookDelivery.updateMany({
    where: {
      id: deliveryId,
      status: "pending",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    data: {
      attemptCount: { increment: 1 },
      nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS),
    },
  });
  if (claimed.count === 0) return "skipped";

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      event: true,
      payload: true,
      attemptCount: true,
      endpointId: true,
      endpoint: {
        select: {
          id: true,
          url: true,
          enabled: true,
          secretEncrypted: true,
          consecutiveFailures: true,
        },
      },
    },
  });
  if (!delivery) return "skipped";

  if (!delivery.endpoint.enabled) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "failed",
        nextAttemptAt: null,
        lastError: "Endpoint is disabled",
      },
    });
    return "failed";
  }

  const body = JSON.stringify(delivery.payload);

  let secret = secretCache.get(delivery.endpointId);
  if (!secret) {
    try {
      secret = await decryptWebhookSecret(delivery.endpoint.secretEncrypted);
      secretCache.set(delivery.endpointId, secret);
    } catch (error) {
      return finalizeFailure({
        delivery,
        error: errorMessage(error),
        responseStatus: null,
        responseBody: null,
      });
    }
  }

  const timestampSeconds = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload({ payload: body, secret, timestampSeconds });

  try {
    const response = await fetch(delivery.endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "PO-App-Webhooks/1.0",
        [WEBHOOK_EVENT_HEADER]: delivery.event,
        [WEBHOOK_DELIVERY_HEADER]: delivery.id,
        [WEBHOOK_ENDPOINT_HEADER]: delivery.endpointId,
        [WEBHOOK_TIMESTAMP_HEADER]: String(timestampSeconds),
        [WEBHOOK_SIGNATURE_HEADER]: signature,
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "manual",
    });

    const responseBody = await readResponseSnippet(response);

    if (response.ok) {
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "succeeded",
            deliveredAt: new Date(),
            nextAttemptAt: null,
            responseStatus: response.status,
            responseBody,
            lastError: null,
          },
        }),
        prisma.webhookEndpoint.update({
          where: { id: delivery.endpointId },
          data: { consecutiveFailures: 0, lastSuccessAt: new Date() },
        }),
      ]);
      return "succeeded";
    }

    return finalizeFailure({
      delivery,
      error: `Endpoint responded with HTTP ${response.status}`,
      responseStatus: response.status,
      responseBody,
    });
  } catch (error) {
    return finalizeFailure({
      delivery,
      error: errorMessage(error),
      responseStatus: null,
      responseBody: null,
    });
  }
}

async function finalizeFailure({
  delivery,
  error,
  responseStatus,
  responseBody,
}: {
  delivery: { id: string; endpointId: string; attemptCount: number };
  error: string;
  responseStatus: number | null;
  responseBody: string | null;
}): Promise<"failed"> {
  const backoffMs = RETRY_BACKOFF_MS[delivery.attemptCount - 1];
  const exhausted = backoffMs === undefined;

  const endpoint = await prisma.webhookEndpoint.update({
    where: { id: delivery.endpointId },
    data: { consecutiveFailures: { increment: 1 }, lastFailureAt: new Date() },
    select: { consecutiveFailures: true, enabled: true },
  });

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: exhausted ? "failed" : "pending",
      nextAttemptAt: exhausted ? null : new Date(Date.now() + backoffMs),
      responseStatus,
      responseBody,
      lastError: error,
    },
  });

  if (endpoint.enabled && endpoint.consecutiveFailures >= AUTO_DISABLE_AFTER_FAILURES) {
    await prisma.webhookEndpoint.update({
      where: { id: delivery.endpointId },
      data: { enabled: false, disabledAt: new Date() },
    });
    console.warn("[webhooks] endpoint auto-disabled after repeated failures", {
      endpointId: delivery.endpointId,
      consecutiveFailures: endpoint.consecutiveFailures,
    });
  }

  return "failed";
}

async function readResponseSnippet(response: Response) {
  try {
    const text = await response.text();
    return text.slice(0, STORED_RESPONSE_CHARS) || null;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.name === "TimeoutError"
      ? `Request timed out after ${REQUEST_TIMEOUT_MS}ms`
      : error.message;
  }
  return "Unknown delivery error";
}
