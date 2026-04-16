import { z } from "zod";

export const purchaseOrderStatusSchema = z.enum(["open", "in_transit", "closed"]);

export const moManufacturerStatusSchema = z.enum([
  "initial",
  "deposit_paid",
  "manufacturing",
  "balance_paid",
  "ready_to_pickup",
  "picked_up",
]);


export const invoiceUpsertSchema = z.object({
  invoiceNumber: z.string().min(1),
  documentKey: z.string().min(1).nullable().optional(),
});

export const invoicePatchSchema = invoiceUpsertSchema.partial();

export const purchaseOrderCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  documentKey: z.string().min(1).nullable().optional(),
  saleChannelId: z.uuid(),
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .default([]),
});

export const purchaseOrderPatchSchema = z.object({
  name: z.string().min(1).optional(),
  status: purchaseOrderStatusSchema.optional(),
  documentKey: z.string().min(1).nullable().optional(),
  saleChannelId: z.uuid().optional(),
});

export const stockOrderCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  documentKey: z.string().min(1).nullable().optional(),
  saleChannelId: z.uuid(),
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .default([]),
});

export const stockOrderPatchSchema = z.object({
  name: z.string().min(1).optional(),
  status: purchaseOrderStatusSchema.optional(),
  documentKey: z.string().min(1).nullable().optional(),
  saleChannelId: z.uuid().optional(),
});

export const purchaseOrderLineCreateSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().positive(),
});

export const purchaseOrderLinePatchSchema = z.object({
  productId: z.uuid().optional(),
  quantity: z.number().int().positive().optional(),
});

export const shippingCreateSchema = z.object({
  trackingNumber: z.string().min(1),
  shippedAt: z.string().datetime(),
  invoiceDocumentKey: z.string().min(1).nullable().optional(),
});

export const shippingPatchSchema = shippingCreateSchema.partial();


export function invoicePayloadToPrisma(data: z.infer<typeof invoiceUpsertSchema>) {
  const out: {
    invoiceNumber: string;
    documentKey?: string | null;
  } = { invoiceNumber: data.invoiceNumber };
  if (data.documentKey !== undefined) out.documentKey = data.documentKey;
  return out;
}

export function invoicePatchToPrisma(data: z.infer<typeof invoicePatchSchema>) {
  const out: {
    invoiceNumber?: string;
    documentKey?: string | null;
  } = {};
  if (data.invoiceNumber !== undefined) out.invoiceNumber = data.invoiceNumber;
  if (data.documentKey !== undefined) out.documentKey = data.documentKey;
  return out;
}
