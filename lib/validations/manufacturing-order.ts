import { z } from "zod";
import {
  invoiceUpsertSchema,
  shippingCreateSchema,
  shippingPatchSchema,
} from "@/lib/validations/purchase-order";

export const manufacturingOrderStatusSchema = z.enum([
  "open",
  "ready_to_ship",
  "shipped",
  "in_transit",
  "delivered",
  "invoiced",
  "paid",
  "closed",
]);

export const moManufacturerPatchSchema = z.object({
  status: z
    .enum([
      "initial",
      "deposit_paid",
      "manufacturing",
      "balance_paid",
      "ready_to_pickup",
    ])
    .optional(),
  invoice: invoiceUpsertSchema.optional(),
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
