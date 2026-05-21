import { z } from "zod";

function blankToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalSecret = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1).max(4096).optional(),
);

export const shopifyIntegrationUpdateSchema = z.object({
  shopDomain: z.string().trim().min(1, "Shop domain is required").max(255),
  enabled: z.boolean(),
  accessToken: optionalSecret,
  webhookSecret: optionalSecret,
});
