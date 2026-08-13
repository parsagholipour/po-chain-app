import { z } from "zod";

export const operatorWarningDisregardSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "A description is required")
    .max(2000, "Description must be 2000 characters or fewer"),
});
