import { z } from "zod";

export const shippingTypeSchema = z.enum([
  "manufacturing_order",
  "purchase_order",
  "stock_order",
]);

export const shippingStatusSchema = z.enum([
  "pending",
  "in_transit",
  "delivered",
  "cancelled",
]);

function blankToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

function trimNullable(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const optionalDateTime = z
  .preprocess(
    blankToNull,
    z
      .union([
        z.string().refine(
          (value) => !Number.isNaN(new Date(value).getTime()),
          "Invalid date and time",
        ),
        z.null(),
      ])
      .optional(),
  );

const optionalNullableString = z.preprocess(
  blankToNull,
  z.string().min(1).nullable().optional(),
);

const optionalNullableUrl = z.preprocess(
  blankToNull,
  z.string().url().nullable().optional(),
);

function emptyOrNaNToNullMoney(value: unknown) {
  if (value === "" || value === undefined) return null;
  if (typeof value === "number" && Number.isNaN(value)) return null;
  return value;
}

const optionalShippingCost = z.preprocess(
  emptyOrNaNToNullMoney,
  z.number().nonnegative("Must be zero or greater").nullable().optional(),
);

export const shippingCreateSchema = z.object({
  type: shippingTypeSchema,
  status: shippingStatusSchema,
  cost: optionalShippingCost,
  deliveryDutiesPaid: z.boolean().optional(),
  trackingNumber: z.string().trim(),
  shippedAt: optionalDateTime,
  trackingLink: optionalNullableUrl,
  notes: optionalNullableString,
  invoiceDocumentKey: optionalNullableString,
  logisticsPartnerId: z.uuid().nullable().optional(),
  manufacturingOrderIds: z.array(z.uuid()).optional(),
  purchaseOrderIds: z.array(z.uuid()).optional(),
});

export const shippingPatchSchema = shippingCreateSchema
  .omit({ type: true })
  .partial()
  .extend({
    manufacturingOrderIds: z.array(z.uuid()).optional(),
    purchaseOrderIds: z.array(z.uuid()).optional(),
  });

function toPrismaDate(v: string | null): Date | null {
  if (v === null) return null;
  return new Date(v);
}

export function shippingCreateToPrisma(data: z.infer<typeof shippingCreateSchema>) {
  return {
    type: data.type,
    status: data.status,
    ...(data.cost !== undefined ? { cost: data.cost } : {}),
    deliveryDutiesPaid: data.deliveryDutiesPaid ?? false,
    trackingNumber: data.trackingNumber.trim(),
    shippedAt: data.shippedAt === undefined ? undefined : toPrismaDate(data.shippedAt),
    trackingLink: trimNullable(data.trackingLink),
    notes: trimNullable(data.notes),
    invoiceDocumentKey: trimNullable(data.invoiceDocumentKey),
    logisticsPartnerId: data.logisticsPartnerId ?? null,
  };
}

export function shippingPatchToPrisma(data: z.infer<typeof shippingPatchSchema>) {
  const out: {
    status?: z.infer<typeof shippingStatusSchema>;
    cost?: number | null;
    deliveryDutiesPaid?: boolean;
    trackingNumber?: string;
    shippedAt?: Date | null;
    trackingLink?: string | null;
    notes?: string | null;
    invoiceDocumentKey?: string | null;
    logisticsPartnerId?: string | null;
  } = {};

  if (data.status !== undefined) out.status = data.status;
  if (data.cost !== undefined) out.cost = data.cost;
  if (data.deliveryDutiesPaid !== undefined) out.deliveryDutiesPaid = data.deliveryDutiesPaid;
  if (data.trackingNumber !== undefined) out.trackingNumber = data.trackingNumber.trim();
  if (data.shippedAt !== undefined) out.shippedAt = toPrismaDate(data.shippedAt);
  if (data.trackingLink !== undefined) out.trackingLink = trimNullable(data.trackingLink);
  if (data.notes !== undefined) out.notes = trimNullable(data.notes);
  if (data.invoiceDocumentKey !== undefined) {
    out.invoiceDocumentKey = trimNullable(data.invoiceDocumentKey);
  }
  if (data.logisticsPartnerId !== undefined) out.logisticsPartnerId = data.logisticsPartnerId;

  return out;
}
