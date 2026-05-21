import { z } from "zod";

function blankToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalSecret = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1).max(4096).optional(),
);

export const stripeIntegrationUpdateSchema = z.object({
  enabled: z.boolean(),
  currency: z
    .string()
    .trim()
    .regex(/^[a-z]{3}$/i, "Currency must be a 3-letter ISO code")
    .toLowerCase(),
  secretKey: optionalSecret.refine(
    (value) => value == null || value.startsWith("sk_"),
    "Stripe secret key must start with sk_",
  ),
  webhookSecret: optionalSecret.refine(
    (value) => value == null || value.startsWith("whsec_"),
    "Stripe webhook signing secret must start with whsec_",
  ),
});
