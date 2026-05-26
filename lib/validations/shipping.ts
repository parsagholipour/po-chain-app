import { z } from "zod";

const shippingDestinationRequiredTypes = new Set(["purchase_order", "stock_order"]);

export const shippingTypeSchema = z.enum([
  "manufacturing_order",
  "purchase_order",
  "stock_order",
  "warehouse_order",
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

const optionalNullableEmail = z.preprocess(
  blankToNull,
  z.string().email().nullable().optional(),
);

const shippingDestinationSchema = {
  saleChannelLocationId: z.uuid().nullable().optional(),
  shipToLocationName: optionalNullableString,
  shipToRecipientName: optionalNullableString,
  shipToCompanyName: optionalNullableString,
  shipToPhoneNumber: optionalNullableString,
  shipToEmail: optionalNullableEmail,
  shipToAddressLine1: optionalNullableString,
  shipToAddressLine2: optionalNullableString,
  shipToCity: optionalNullableString,
  shipToStateProvince: optionalNullableString,
  shipToPostalCode: optionalNullableString,
  shipToCountry: optionalNullableString,
  shipToNotes: optionalNullableString,
};

const shippingCreateObjectSchema = z.object({
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
  warehouseOrderIds: z.array(z.uuid()).optional(),
  ...shippingDestinationSchema,
});

export const shippingCreateSchema = shippingCreateObjectSchema.superRefine(
  (data, ctx) => {
    if (shippingDestinationRequiredTypes.has(data.type) && !data.saleChannelLocationId) {
      ctx.addIssue({
        code: "custom",
        path: ["saleChannelLocationId"],
        message: "Select a destination location",
      });
    }
  },
);

export const shippingPatchSchema = shippingCreateObjectSchema
  .omit({ type: true })
  .partial()
  .extend({
    manufacturingOrderIds: z.array(z.uuid()).optional(),
    purchaseOrderIds: z.array(z.uuid()).optional(),
    warehouseOrderIds: z.array(z.uuid()).optional(),
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
    saleChannelLocationId: data.saleChannelLocationId ?? null,
    shipToLocationName: trimNullable(data.shipToLocationName),
    shipToRecipientName: trimNullable(data.shipToRecipientName),
    shipToCompanyName: trimNullable(data.shipToCompanyName),
    shipToPhoneNumber: trimNullable(data.shipToPhoneNumber),
    shipToEmail: trimNullable(data.shipToEmail),
    shipToAddressLine1: trimNullable(data.shipToAddressLine1),
    shipToAddressLine2: trimNullable(data.shipToAddressLine2),
    shipToCity: trimNullable(data.shipToCity),
    shipToStateProvince: trimNullable(data.shipToStateProvince),
    shipToPostalCode: trimNullable(data.shipToPostalCode),
    shipToCountry: trimNullable(data.shipToCountry),
    shipToNotes: trimNullable(data.shipToNotes),
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
    saleChannelLocationId?: string | null;
    shipToLocationName?: string | null;
    shipToRecipientName?: string | null;
    shipToCompanyName?: string | null;
    shipToPhoneNumber?: string | null;
    shipToEmail?: string | null;
    shipToAddressLine1?: string | null;
    shipToAddressLine2?: string | null;
    shipToCity?: string | null;
    shipToStateProvince?: string | null;
    shipToPostalCode?: string | null;
    shipToCountry?: string | null;
    shipToNotes?: string | null;
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
  if (data.saleChannelLocationId !== undefined) {
    out.saleChannelLocationId = data.saleChannelLocationId;
  }
  if (data.shipToLocationName !== undefined) {
    out.shipToLocationName = trimNullable(data.shipToLocationName);
  }
  if (data.shipToRecipientName !== undefined) {
    out.shipToRecipientName = trimNullable(data.shipToRecipientName);
  }
  if (data.shipToCompanyName !== undefined) {
    out.shipToCompanyName = trimNullable(data.shipToCompanyName);
  }
  if (data.shipToPhoneNumber !== undefined) {
    out.shipToPhoneNumber = trimNullable(data.shipToPhoneNumber);
  }
  if (data.shipToEmail !== undefined) out.shipToEmail = trimNullable(data.shipToEmail);
  if (data.shipToAddressLine1 !== undefined) {
    out.shipToAddressLine1 = trimNullable(data.shipToAddressLine1);
  }
  if (data.shipToAddressLine2 !== undefined) {
    out.shipToAddressLine2 = trimNullable(data.shipToAddressLine2);
  }
  if (data.shipToCity !== undefined) out.shipToCity = trimNullable(data.shipToCity);
  if (data.shipToStateProvince !== undefined) {
    out.shipToStateProvince = trimNullable(data.shipToStateProvince);
  }
  if (data.shipToPostalCode !== undefined) {
    out.shipToPostalCode = trimNullable(data.shipToPostalCode);
  }
  if (data.shipToCountry !== undefined) out.shipToCountry = trimNullable(data.shipToCountry);
  if (data.shipToNotes !== undefined) out.shipToNotes = trimNullable(data.shipToNotes);

  return out;
}
