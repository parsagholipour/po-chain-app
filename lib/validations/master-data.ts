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
});

export const manufacturerUpdateSchema = manufacturerCreateSchema.partial();

export const saleChannelCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  logoKey: nullableOptionalString,
  type: saleChannelTypeSchema,
});

export const saleChannelUpdateSchema = saleChannelCreateSchema.partial();

export const logisticsPartnerCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  logoKey: nullableOptionalString,
  contactNumber: nullableOptionalString,
  link: nullableOptionalUrl,
  type: logisticsPartnerTypeSchema,
});

export const logisticsPartnerUpdateSchema = logisticsPartnerCreateSchema
  .omit({ type: true })
  .partial();

export const productCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  imageKey: nullableOptionalString,
  barcodeKey: nullableOptionalString,
  packagingKey: nullableOptionalString,
  defaultManufacturerId: z.uuid(),
  verified: z.boolean().optional(),
});

export const productUpdateSchema = productCreateSchema.partial();
