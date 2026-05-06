import { z } from "zod";

export const warehouseOrderStatusSchema = z.enum(["open", "shipped", "closed"]);

const lineInputSchema = z.object({
  purchaseOrderLineId: z.uuid(),
  quantity: z.number().int().positive(),
});

export const warehouseOrderCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  documentKey: z.string().min(1).nullable().optional(),
  warehouseId: z.uuid(),
  purchaseOrderIds: z.array(z.uuid()).default([]),
  lines: z.array(lineInputSchema).default([]),
});

export const warehouseOrderPatchSchema = z.object({
  name: z.string().min(1).optional(),
  status: warehouseOrderStatusSchema.optional(),
  documentKey: z.string().min(1).nullable().optional(),
  warehouseId: z.uuid().optional(),
});

export const warehouseOrderLineCreateSchema = lineInputSchema;

export const warehouseOrderLinePatchSchema = z.object({
  quantity: z.number().int().positive().optional(),
});
