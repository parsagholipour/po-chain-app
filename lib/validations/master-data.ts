import { z } from "zod";

export const saleChannelTypeSchema = z.enum([
  "distributor",
  "amazon",
  "cjdropshipping",
]);

export const manufacturerCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  logoKey: z.string().min(1).nullable().optional(),
  region: z.string().min(1, "Region is required"),
});

export const manufacturerUpdateSchema = manufacturerCreateSchema.partial();

export const saleChannelCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  logoKey: z.string().min(1).nullable().optional(),
  type: saleChannelTypeSchema,
});

export const saleChannelUpdateSchema = saleChannelCreateSchema.partial();

export const productCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  imageKey: z.string().min(1).nullable().optional(),
  barcodeKey: z.string().min(1).nullable().optional(),
  packagingKey: z.string().min(1).nullable().optional(),
  defaultManufacturerId: z.uuid(),
  verified: z.boolean().optional(),
});

export const productUpdateSchema = productCreateSchema.partial();
