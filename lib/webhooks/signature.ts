import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SECRET_PREFIX = "whsec";
export const WEBHOOK_SIGNATURE_HEADER = "x-po-signature";
export const WEBHOOK_EVENT_HEADER = "x-po-event";
export const WEBHOOK_DELIVERY_HEADER = "x-po-delivery";
export const WEBHOOK_ENDPOINT_HEADER = "x-po-webhook-id";
export const WEBHOOK_TIMESTAMP_HEADER = "x-po-timestamp";

/** Replay window a receiver should enforce when checking the timestamp. */
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;

export function generateWebhookSecret() {
  return `${WEBHOOK_SECRET_PREFIX}_${randomBytes(32).toString("base64url")}`;
}

export function webhookSecretLast4(secret: string) {
  return secret.slice(-4);
}

/**
 * Signs `<timestamp>.<body>` so a receiver can reject replays. Format matches
 * the widely used `t=<unix>,v1=<hex>` convention.
 */
export function signWebhookPayload({
  payload,
  secret,
  timestampSeconds,
}: {
  payload: string;
  secret: string;
  timestampSeconds: number;
}) {
  const signature = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

/** Exported so integration tests (and receivers written in TS) can reuse it. */
export function verifyWebhookSignature({
  payload,
  secret,
  header,
  timestampSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
}: {
  payload: string;
  secret: string;
  header: string | null;
  timestampSeconds?: number;
  toleranceSeconds?: number;
}) {
  if (!header) return false;

  const parts = new Map(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")] as const;
    }),
  );

  const signedAt = Number.parseInt(parts.get("t") ?? "", 10);
  const provided = parts.get("v1");
  if (!Number.isFinite(signedAt) || !provided) return false;
  if (Math.abs(timestampSeconds - signedAt) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${signedAt}.${payload}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}
