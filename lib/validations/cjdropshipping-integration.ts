import { z } from "zod";

function blankToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalSecret = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1).max(4096).optional(),
);

export const cjDropshippingIntegrationUpdateSchema = z.object({
  enabled: z.boolean(),
  apiKey: optionalSecret,
});
