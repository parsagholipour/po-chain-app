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
  /** When set, updates ordered quantity; effective quantity is recomputed from OS&D. */
  quantity: z.number().int().positive().optional(),
});

export const purchaseOrderOsdTypeSchema = z.enum(["overage", "shortage", "damage"]);
export const purchaseOrderOsdResolutionSchema = z.enum(["charged", "returned", "sent"]);

const osdLineInputSchema = z.object({
  purchaseOrderLineId: z.uuid(),
  quantity: z.number().int().positive(),
});

export const osdCreateSchema = z
  .object({
    type: purchaseOrderOsdTypeSchema,
    resolution: purchaseOrderOsdResolutionSchema,
    manufacturingOrderId: z.uuid().nullable().optional(),
    manufacturerId: z.uuid().nullable().optional(),
    documentKey: z.string().min(1).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    lines: z.array(osdLineInputSchema).min(1),
  })
  .superRefine((data, ctx) => {
    if (data.manufacturerId && !data.manufacturingOrderId) {
      ctx.addIssue({
        code: "custom",
        message: "manufacturingOrderId is required when manufacturerId is set",
        path: ["manufacturingOrderId"],
      });
    }
    if (data.type === "damage") {
      if (data.resolution !== "charged") {
        ctx.addIssue({
          code: "custom",
          message: "Damage requires resolution charged",
          path: ["resolution"],
        });
      }
    } else if (data.type === "overage") {
      if (data.resolution !== "charged" && data.resolution !== "returned") {
        ctx.addIssue({
          code: "custom",
          message: "Overage resolution must be charged or returned",
          path: ["resolution"],
        });
      }
    } else     if (data.type === "shortage") {
      if (data.resolution !== "charged" && data.resolution !== "sent") {
        ctx.addIssue({
          code: "custom",
          message: "Shortage resolution must be charged or sent",
          path: ["resolution"],
        });
      }
    }
    const lineIds = data.lines.map((l) => l.purchaseOrderLineId);
    if (new Set(lineIds).size !== lineIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "Each purchase order line can only appear once",
        path: ["lines"],
      });
    }
  });

export const osdPatchSchema = z
  .object({
    type: purchaseOrderOsdTypeSchema.optional(),
    resolution: purchaseOrderOsdResolutionSchema.optional(),
    manufacturingOrderId: z.uuid().nullable().optional(),
    manufacturerId: z.uuid().nullable().optional(),
    documentKey: z.string().min(1).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    lines: z.array(osdLineInputSchema).min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.manufacturerId && data.manufacturingOrderId === null) {
      ctx.addIssue({
        code: "custom",
        message: "Cannot clear manufacturing order while manufacturer is set",
        path: ["manufacturingOrderId"],
      });
    }
    if (data.lines) {
      const lineIds = data.lines.map((l) => l.purchaseOrderLineId);
      if (new Set(lineIds).size !== lineIds.length) {
        ctx.addIssue({
          code: "custom",
          message: "Each purchase order line can only appear once",
          path: ["lines"],
        });
      }
    }
  });

export type OsdCreateInput = z.infer<typeof osdCreateSchema>;
export type OsdPatchInput = z.infer<typeof osdPatchSchema>;

export function assertMergedOsdTypeResolution(
  type: z.infer<typeof purchaseOrderOsdTypeSchema>,
  resolution: z.infer<typeof purchaseOrderOsdResolutionSchema>,
): void {
  if (type === "damage" && resolution !== "charged") {
    throw new Error("INVALID_OSD_RESOLUTION");
  }
  if (type === "overage" && resolution !== "charged" && resolution !== "returned") {
    throw new Error("INVALID_OSD_RESOLUTION");
  }
  if (type === "shortage" && resolution !== "charged" && resolution !== "sent") {
    throw new Error("INVALID_OSD_RESOLUTION");
  }
}

/** @returns false when combination is invalid (damage must be charged, etc.) */
export function isValidMergedOsdTypeResolution(
  type: z.infer<typeof purchaseOrderOsdTypeSchema>,
  resolution: z.infer<typeof purchaseOrderOsdResolutionSchema>,
): boolean {
  try {
    assertMergedOsdTypeResolution(type, resolution);
    return true;
  } catch {
    return false;
  }
}

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
