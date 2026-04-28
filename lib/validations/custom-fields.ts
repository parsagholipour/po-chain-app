import { z } from "zod";

export const customFieldTypeSchema = z.enum([
  "text",
  "number",
  "date",
  "boolean",
  "file",
  "image",
]);

export const customFieldEntityTypeSchema = z.enum([
  "product",
  "product_category",
  "product_type",
  "manufacturer",
  "sale_channel",
  "logistics_partner",
  "shipping",
]);

export type CustomFieldEntityType = z.infer<typeof customFieldEntityTypeSchema>;

export const conditionOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "greater_than_or_equal",
  "less_than_or_equal",
  "contains",
  "not_empty",
  "is_empty",
]);

export const conditionLogicSchema = z.enum(["and", "or"]);

export const conditionItemSchema = z.object({
  id: z.string().uuid().optional(),
  sourceField: z.string().min(1, "Source field is required"),
  operator: conditionOperatorSchema,
  value: z.string().default(""),
});

const fieldKeyRegex = /^[a-z][a-z0-9_]*$/;

export const customFieldDefinitionCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fieldKey: z
    .string()
    .min(1, "Key is required")
    .regex(fieldKeyRegex, "Must start with a letter; only lowercase letters, digits, and underscores"),
  type: customFieldTypeSchema,
  entityType: customFieldEntityTypeSchema,
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  conditionLogic: conditionLogicSchema.optional(),
  conditions: z.array(conditionItemSchema).optional(),
});

export const customFieldDefinitionUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  conditionLogic: conditionLogicSchema.optional(),
  conditions: z.array(conditionItemSchema).optional(),
});

export const customFieldValueItemSchema = z.object({
  definitionId: z.string().uuid(),
  textValue: z.string().nullable().optional(),
  numberValue: z.number().nullable().optional(),
  dateValue: z.string().nullable().optional(),
  booleanValue: z.boolean().nullable().optional(),
  fileKey: z.string().nullable().optional(),
});

export const customFieldValuesBulkSchema = z.object({
  values: z.array(customFieldValueItemSchema),
});
