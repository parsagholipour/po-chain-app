import { z } from "zod";
import {
  invoiceUpsertSchema,
} from "@/lib/validations/purchase-order";
import { shippingCreateSchema, shippingPatchSchema } from "@/lib/validations/shipping";

export const manufacturingOrderStatusSchema = z.enum([
  "open",
  "ready_to_ship",
  "shipped",
  "invoiced",
  "paid",
  "closed",
]);

const optionalIsoDateTime = z.union([z.string().datetime(), z.null()]).optional();
const optionalNote = z.string().max(5000).nullable().optional();

export const moManufacturerPatchSchema = z.object({
  status: z
    .enum([
      "initial",
      "deposit_paid",
      "manufacturing",
      "balance_paid",
      "ready_to_pickup",
      "picked_up",
    ])
    .optional(),
  invoice: invoiceUpsertSchema.optional(),

  depositPaidAt: optionalIsoDateTime,
  depositPaidAmount: z.number().nonnegative().nullable().optional(),
  depositRefNumber: z.string().nullable().optional(),
  depositDocumentKey: z.string().nullable().optional(),
  depositNote: optionalNote,

  manufacturingStartedAt: optionalIsoDateTime,
  estimatedCompletionAt: optionalIsoDateTime,
  manufacturingNote: optionalNote,

  balancePaidAt: optionalIsoDateTime,
  balancePaidAmount: z.number().nonnegative().nullable().optional(),
  balanceRefNumber: z.string().nullable().optional(),
  balanceDocumentKey: z.string().nullable().optional(),
  balanceNote: optionalNote,

  readyAt: optionalIsoDateTime,
  readyNote: optionalNote,
  pickedUpAt: optionalIsoDateTime,
  pickedUpNote: optionalNote,
});

export const manufacturingOrderCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  documentKey: z.string().min(1).nullable().optional(),
  status: manufacturingOrderStatusSchema.optional(),
  purchaseOrderIds: z.array(z.uuid()).default([]),
  manufacturers: z
    .array(
      z.object({
        manufacturerId: z.uuid(),
        status: z
          .enum([
            "initial",
            "deposit_paid",
            "manufacturing",
            "balance_paid",
            "ready_to_pickup",
            "picked_up",
          ])
          .optional(),
      }),
    )
    .default([]),
});

export const manufacturingOrderPatchSchema = z.object({
  name: z.string().min(1).optional(),
  status: manufacturingOrderStatusSchema.optional(),
  documentKey: z.string().min(1).nullable().optional(),
});

export const moLineAllocationCreateSchema = z.object({
  purchaseOrderLineId: z.uuid(),
  manufacturerId: z.uuid(),
  verified: z.boolean().optional(),
});

export const moLineAllocationPatchSchema = z.object({
  manufacturerId: z.uuid().optional(),
  verified: z.boolean().optional(),
});

export const moShippingCreateSchema = shippingCreateSchema;
export const moShippingPatchSchema = shippingPatchSchema;
