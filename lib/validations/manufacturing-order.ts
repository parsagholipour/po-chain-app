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
  depositTrackingNumber: z.string().nullable().optional(),
  depositDocumentKey: z.string().nullable().optional(),

  manufacturingStartedAt: optionalIsoDateTime,

  balancePaidAt: optionalIsoDateTime,
  balancePaidAmount: z.number().nonnegative().nullable().optional(),
  balanceTrackingNumber: z.string().nullable().optional(),
  balanceDocumentKey: z.string().nullable().optional(),

  readyAt: optionalIsoDateTime,
  pickedUpAt: optionalIsoDateTime,
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
