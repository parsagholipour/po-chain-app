import { z } from "zod";

function blankToNull(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const nullableOptionalEmail = z.preprocess(
  blankToNull,
  z.string().email("Enter a valid email").nullable().optional(),
);

const nullableOptionalUrl = z.preprocess(
  blankToNull,
  z.string().url("Enter a valid URL").nullable().optional(),
);

export const superAdminStoreUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.string().trim().min(1, "Slug is required"),
  email: nullableOptionalEmail,
  website: nullableOptionalUrl,
});

export type SuperAdminStoreFormValues = z.infer<
  typeof superAdminStoreUpdateSchema
>;
