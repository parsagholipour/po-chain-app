import { z } from "zod";
import { API_TOKEN_SCOPES, WEBHOOK_EVENTS } from "@/lib/developer-api-constants";

export const apiTokenCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  scopes: z
    .array(z.enum(API_TOKEN_SCOPES))
    .min(1, "Select at least one scope")
    .transform((scopes) => Array.from(new Set(scopes))),
  expiresInDays: z.number().int().positive().max(3650).nullable().optional(),
});

export const apiTokenUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});

/**
 * Blocks the obvious SSRF targets. Loopback and private ranges stay allowed in
 * development so a local receiver can be tested against the dev server.
 */
const webhookUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required")
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a valid http(s) URL")
  .refine((value) => {
    if (process.env.NODE_ENV !== "production") return true;
    return new URL(value).protocol === "https:";
  }, "Webhook URLs must use https")
  .refine((value) => {
    if (process.env.NODE_ENV !== "production") return true;
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost")) return false;
    if (hostname === "0.0.0.0" || hostname === "::1" || hostname === "[::1]") return false;
    if (/^127\./.test(hostname)) return false;
    if (/^10\./.test(hostname)) return false;
    if (/^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    if (/^169\.254\./.test(hostname)) return false;
    return true;
  }, "Private and loopback addresses are not allowed");

export const webhookEndpointCreateSchema = z.object({
  url: webhookUrlSchema,
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value ? value : null)),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, "Select at least one event")
    .transform((events) => Array.from(new Set(events))),
  enabled: z.boolean().optional(),
});

export const webhookEndpointUpdateSchema = webhookEndpointCreateSchema.partial();

export type ApiTokenCreateInput = z.infer<typeof apiTokenCreateSchema>;
export type WebhookEndpointCreateInput = z.infer<typeof webhookEndpointCreateSchema>;
