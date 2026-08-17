import { z } from "zod";

function blankToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalSecret = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1).max(4096).optional(),
);

export const crmIntegrationUpdateSchema = z.object({
  baseUrl: z.string().trim().min(1, "CRM host URL is required").max(255),
  enabled: z.boolean(),
  apiToken: optionalSecret,
  webhookSecret: optionalSecret,
});
