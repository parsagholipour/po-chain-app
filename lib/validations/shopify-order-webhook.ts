import { z } from "zod";

const noteAttributeSchema = z
  .object({
    name: z.string().nullish(),
    value: z.string().nullish(),
  })
  .loose();

/**
 * Deliberately permissive: a rejected payload is a paid order we would silently drop,
 * and Shopify adds fields to the REST order shape without notice.
 */
export const shopifyOrderWebhookSchema = z
  .object({
    id: z.union([z.number(), z.string()]).nullish(),
    admin_graphql_api_id: z.string().nullish(),
    name: z.string().nullish(),
    currency: z.string().nullish(),
    total_price: z.union([z.string(), z.number()]).nullish(),
    financial_status: z.string().nullish(),
    cancelled_at: z.string().nullish(),
    test: z.boolean().nullish(),
    note_attributes: z.array(noteAttributeSchema).nullish(),
  })
  .loose();

export type ShopifyOrderWebhookPayload = z.infer<typeof shopifyOrderWebhookSchema>;
