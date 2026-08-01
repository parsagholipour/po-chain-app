/**
 * Shared vocabulary for the public API and outbound webhooks. Kept free of
 * `server-only` so the Settings UI and the Zod schemas can import it too.
 */

/** Scopes are stored as plain strings so new ones do not need a migration. */
export const API_TOKEN_SCOPES = ["products:read"] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

export const API_TOKEN_SCOPE_LABELS: Record<ApiTokenScope, string> = {
  "products:read": "Read products and their relations",
};

export const WEBHOOK_EVENTS = [
  "product.created",
  "product.updated",
  "product.deleted",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "product.created": "Product created",
  "product.updated": "Product updated",
  "product.deleted": "Product deleted",
};

/** Sent by the "Send test event" action; never emitted by real activity. */
export const WEBHOOK_TEST_EVENT = "webhook.test";

export function isApiTokenScope(value: string): value is ApiTokenScope {
  return (API_TOKEN_SCOPES as readonly string[]).includes(value);
}

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}
