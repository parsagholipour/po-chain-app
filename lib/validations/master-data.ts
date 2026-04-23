import { z } from "zod";

function blankToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

const nullableOptionalString = z.preprocess(
  blankToNull,
  z.string().min(1).nullable().optional(),
);

const nullableOptionalUrl = z.preprocess(
  blankToNull,
  z.string().url().nullable().optional(),
);

const nullableOptionalEmail = z.preprocess(
  blankToNull,
  z.string().email().nullable().optional(),
);

export const saleChannelTypeSchema = z.enum([
  "distributor",
  "amazon",
  "cjdropshipping",
]);

export const logisticsPartnerTypeSchema = z.enum([
  "freight_forwarder",
  "carrier",
]);

export const manufacturerCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  logoKey: nullableOptionalString,
  region: z.string().min(1, "Region is required"),
  contactNumber: nullableOptionalString,
  address: nullableOptionalString,
  email: nullableOptionalEmail,
  link: nullableOptionalUrl,
  notes: nullableOptionalString,
});

export const manufacturerUpdateSchema = manufacturerCreateSchema.partial();

export const saleChannelCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  logoKey: nullableOptionalString,
  type: saleChannelTypeSchema,
  contactNumber: nullableOptionalString,
  address: nullableOptionalString,
  email: nullableOptionalEmail,
  link: nullableOptionalUrl,
  notes: nullableOptionalString,
});

export const saleChannelUpdateSchema = saleChannelCreateSchema.partial();

export const logisticsPartnerCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  logoKey: nullableOptionalString,
  contactNumber: nullableOptionalString,
  link: nullableOptionalUrl,
  email: nullableOptionalEmail,
  address: nullableOptionalString,
  notes: nullableOptionalString,
  type: logisticsPartnerTypeSchema,
});

export const logisticsPartnerUpdateSchema = logisticsPartnerCreateSchema
  .omit({ type: true })
  .partial();

export const productCategoryCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export const productCategoryUpdateSchema = productCategoryCreateSchema.partial();

export const productCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  cost: z.number().nonnegative().nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  imageKey: nullableOptionalString,
  barcodeKey: nullableOptionalString,
  packagingKey: nullableOptionalString,
  defaultManufacturerId: z.uuid(),
  categoryId: z.preprocess(blankToNull, z.string().uuid().nullable().optional()),
  verified: z.boolean().optional(),
});

export const productUpdateSchema = productCreateSchema.partial();
