"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useFormState } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { CustomFieldDefinition } from "@/lib/types/api";

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Checkbox" },
  { value: "file", label: "File" },
  { value: "image", label: "Image" },
] as const;

const OPERATOR_OPTIONS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not equals" },
  { value: "greater_than", label: "Greater than" },
  { value: "less_than", label: "Less than" },
  { value: "greater_than_or_equal", label: "Greater or equal" },
  { value: "less_than_or_equal", label: "Less or equal" },
  { value: "contains", label: "Contains" },
  { value: "not_empty", label: "Not empty" },
  { value: "is_empty", label: "Is empty" },
] as const;

type NativeField = { value: string; label: string };

const NATIVE_FIELDS: Record<string, NativeField[]> = {
  product: [
    { value: "name", label: "Name" },
    { value: "sku", label: "SKU" },
    { value: "cost", label: "Cost" },
    { value: "price", label: "Price" },
    { value: "verified", label: "Verified" },
  ],
  product_category: [{ value: "name", label: "Name" }],
  manufacturer: [
    { value: "name", label: "Name" },
    { value: "region", label: "Region" },
    { value: "contactNumber", label: "Contact Number" },
    { value: "email", label: "Email" },
    { value: "link", label: "Link" },
    { value: "address", label: "Address" },
    { value: "notes", label: "Notes" },
  ],
  sale_channel: [
    { value: "name", label: "Name" },
    { value: "type", label: "Type" },
  ],
  logistics_partner: [
    { value: "name", label: "Name" },
    { value: "contactNumber", label: "Contact Number" },
    { value: "link", label: "Link" },
    { value: "type", label: "Type" },
  ],
  shipping: [
    { value: "type", label: "Type" },
    { value: "status", label: "Status" },
    { value: "cost", label: "Cost" },
    { value: "deliveryDutiesPaid", label: "Delivery Duties Paid" },
    { value: "trackingNumber", label: "Tracking Number" },
    { value: "trackingLink", label: "Tracking Link" },
    { value: "notes", label: "Notes" },
  ],
};

const conditionSchema = z.object({
  id: z.string().optional(),
  sourceField: z.string().min(1, "Required"),
  operator: z.enum([
    "equals", "not_equals", "greater_than", "less_than",
    "greater_than_or_equal", "less_than_or_equal", "contains",
    "not_empty", "is_empty",
  ]),
  value: z.string(),
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fieldKey: z
    .string()
    .min(1, "Key is required")
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "Lowercase letters, digits, underscores; must start with a letter",
    ),
  type: z.enum(["text", "number", "date", "boolean", "file", "image"]),
  required: z.boolean(),
  sortOrder: z.number().int(),
  conditionLogic: z.enum(["and", "or"]),
  conditions: z.array(conditionSchema),
});

const editSchema = z.object({
  name: z.string().min(1, "Name is required"),
  required: z.boolean(),
  sortOrder: z.number().int(),
  conditionLogic: z.enum(["and", "or"]),
  conditions: z.array(conditionSchema),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CustomFieldDefinition | null;
  entityType: string;
  siblingDefinitions: CustomFieldDefinition[];
  onSave: (values: Record<string, unknown>) => Promise<void>;
};

function sourceFieldOptions(
  entityType: string,
  siblingDefinitions: CustomFieldDefinition[],
  excludeFieldKey?: string,
) {
  const native = NATIVE_FIELDS[entityType] ?? [];
  const custom = siblingDefinitions
    .filter((d) => d.fieldKey !== excludeFieldKey)
    .map((d) => ({
      value: `custom:${d.fieldKey}`,
      label: `${d.name} (custom)`,
    }));
  return [...native, ...custom];
}

const UNARY_OPERATORS = new Set(["not_empty", "is_empty"]);

function ConditionsEditor({
  control,
  entityType,
  siblingDefinitions,
  excludeFieldKey,
}: {
  control: ReturnType<typeof useForm<CreateValues | EditValues>>["control"];
  entityType: string;
  siblingDefinitions: CustomFieldDefinition[];
  excludeFieldKey?: string;
}) {
  const { fields, append, remove } = useFieldArray({
    control: control as ReturnType<typeof useForm<CreateValues>>["control"],
    name: "conditions",
  });

  const sources = sourceFieldOptions(entityType, siblingDefinitions, excludeFieldKey);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <FieldLabel className="text-sm font-medium">Conditions</FieldLabel>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ sourceField: "", operator: "equals", value: "" })}
        >
          <Plus className="mr-1 size-3.5" />
          Add
        </Button>
      </div>

      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
              <Controller
                control={control as ReturnType<typeof useForm<CreateValues>>["control"]}
                name={`conditions.${index}.sourceField`}
                render={({ field: f }) => (
                  <Select value={f.value} onValueChange={f.onChange}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Field" />
                    </SelectTrigger>
                    <SelectContent>
                      {sources.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Controller
                control={control as ReturnType<typeof useForm<CreateValues>>["control"]}
                name={`conditions.${index}.operator`}
                render={({ field: f }) => (
                  <Select value={f.value} onValueChange={f.onChange}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Operator" />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATOR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Controller
                control={control as ReturnType<typeof useForm<CreateValues>>["control"]}
                name={`conditions.${index}.operator`}
                render={({ field: opField }) =>
                  UNARY_OPERATORS.has(opField.value) ? (
                    <div className="w-[120px]" />
                  ) : (
                    <Controller
                      control={control as ReturnType<typeof useForm<CreateValues>>["control"]}
                      name={`conditions.${index}.value`}
                      render={({ field: vf }) => (
                        <Input
                          className="w-[120px]"
                          placeholder="Value"
                          value={vf.value}
                          onChange={vf.onChange}
                        />
                      )}
                    />
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mt-1.5 text-destructive hover:text-destructive"
                onClick={() => remove(index)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {fields.length > 1 && (
        <Controller
          control={control as ReturnType<typeof useForm<CreateValues>>["control"]}
          name="conditionLogic"
          render={({ field }) => (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Match:</span>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  className="accent-primary"
                  checked={field.value === "and"}
                  onChange={() => field.onChange("and")}
                />
                All (AND)
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  className="accent-primary"
                  checked={field.value === "or"}
                  onChange={() => field.onChange("or")}
                />
                Any (OR)
              </label>
            </div>
          )}
        />
      )}
    </div>
  );
}

function CreateForm({
  entityType,
  siblingDefinitions,
  onSave,
  onCancel,
}: {
  entityType: string;
  siblingDefinitions: CustomFieldDefinition[];
  onSave: (v: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      fieldKey: "",
      type: "text",
      required: false,
      sortOrder: 0,
      conditionLogic: "and",
      conditions: [],
    },
  });
  const { isSubmitting } = useFormState({ control: form.control });

  async function handleSubmit(values: CreateValues) {
    await onSave(values);
    onCancel();
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <FieldSet className="gap-4">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!form.formState.errors.name} className="gap-1.5">
            <FieldLabel htmlFor="cfd-name">Name</FieldLabel>
            <FieldContent>
              <Input id="cfd-name" {...form.register("name")} placeholder="e.g. Warranty Period" />
              <FieldError errors={[form.formState.errors.name]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.fieldKey} className="gap-1.5">
            <FieldLabel htmlFor="cfd-key">Key</FieldLabel>
            <FieldContent>
              <Input
                id="cfd-key"
                {...form.register("fieldKey")}
                placeholder="e.g. warranty_period"
              />
              <FieldError errors={[form.formState.errors.fieldKey]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.type} className="gap-1.5">
            <FieldLabel>Type</FieldLabel>
            <FieldContent>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    items={FIELD_TYPE_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Field type" />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.type]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.sortOrder} className="gap-1.5">
            <FieldLabel htmlFor="cfd-sort">Sort order</FieldLabel>
            <FieldContent>
              <Input
                id="cfd-sort"
                type="number"
                {...form.register("sortOrder", { valueAsNumber: true })}
              />
              <FieldError errors={[form.formState.errors.sortOrder]} />
            </FieldContent>
          </Field>
          <Field orientation="horizontal" className="gap-2">
            <Controller
              control={form.control}
              name="required"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  label={<span className="font-normal">Required</span>}
                />
              )}
            />
          </Field>

          <div className="border-t pt-4">
            <ConditionsEditor
              control={form.control as ReturnType<typeof useForm<CreateValues | EditValues>>["control"]}
              entityType={entityType}
              siblingDefinitions={siblingDefinitions}
            />
          </div>
        </FieldGroup>
      </FieldSet>
      <DialogFooter className="mt-4 border-0 bg-transparent">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditForm({
  editing,
  entityType,
  siblingDefinitions,
  onSave,
  onCancel,
}: {
  editing: CustomFieldDefinition;
  entityType: string;
  siblingDefinitions: CustomFieldDefinition[];
  onSave: (v: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: editing.name,
      required: editing.required,
      sortOrder: editing.sortOrder,
      conditionLogic: editing.conditionLogic ?? "and",
      conditions: (editing.conditions ?? []).map((c) => ({
        id: c.id,
        sourceField: c.sourceField,
        operator: c.operator,
        value: c.value,
      })),
    },
  });
  const { isSubmitting } = useFormState({ control: form.control });

  async function handleSubmit(values: EditValues) {
    await onSave(values);
    onCancel();
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <FieldSet className="gap-4">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!form.formState.errors.name} className="gap-1.5">
            <FieldLabel htmlFor="cfd-name">Name</FieldLabel>
            <FieldContent>
              <Input id="cfd-name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </FieldContent>
          </Field>
          <Field className="gap-1.5">
            <FieldLabel>Key</FieldLabel>
            <FieldContent>
              <Input value={editing.fieldKey} disabled />
            </FieldContent>
          </Field>
          <Field className="gap-1.5">
            <FieldLabel>Type</FieldLabel>
            <FieldContent>
              <Input
                value={
                  FIELD_TYPE_OPTIONS.find((o) => o.value === editing.type)
                    ?.label ?? editing.type
                }
                disabled
              />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.sortOrder} className="gap-1.5">
            <FieldLabel htmlFor="cfd-sort">Sort order</FieldLabel>
            <FieldContent>
              <Input
                id="cfd-sort"
                type="number"
                {...form.register("sortOrder", { valueAsNumber: true })}
              />
              <FieldError errors={[form.formState.errors.sortOrder]} />
            </FieldContent>
          </Field>
          <Field orientation="horizontal" className="gap-2">
            <Controller
              control={form.control}
              name="required"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  label={<span className="font-normal">Required</span>}
                />
              )}
            />
          </Field>

          <div className="border-t pt-4">
            <ConditionsEditor
              control={form.control as ReturnType<typeof useForm<CreateValues | EditValues>>["control"]}
              entityType={entityType}
              siblingDefinitions={siblingDefinitions}
              excludeFieldKey={editing.fieldKey}
            />
          </div>
        </FieldGroup>
      </FieldSet>
      <DialogFooter className="mt-4 border-0 bg-transparent">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function FieldDefinitionUpsertDialog({
  open,
  onOpenChange,
  editing,
  entityType,
  siblingDefinitions,
  onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit custom field" : "New custom field"}
          </DialogTitle>
        </DialogHeader>
        {editing ? (
          <EditForm
            key={editing.id}
            editing={editing}
            entityType={entityType}
            siblingDefinitions={siblingDefinitions}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <CreateForm
            key={open ? "create" : "idle"}
            entityType={entityType}
            siblingDefinitions={siblingDefinitions}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
