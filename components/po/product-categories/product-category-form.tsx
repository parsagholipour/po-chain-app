"use client";

import { useRef } from "react";
import { useForm, useFormState, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { productCategoryCreateSchema } from "@/lib/validations/master-data";
import {
  CustomFieldsRenderer,
  type CustomFieldsHandle,
} from "@/components/po/custom-fields/custom-fields-renderer";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export type ProductCategoryFormValues = z.infer<typeof productCategoryCreateSchema>;

export function emptyProductCategoryFormValues(): ProductCategoryFormValues {
  return { name: "" };
}

type Props = {
  defaultValues: ProductCategoryFormValues;
  editingId?: string | null;
  onSubmit: (values: ProductCategoryFormValues) => Promise<string>;
  onCancel: () => void;
};

export function ProductCategoryForm({ defaultValues, editingId, onSubmit, onCancel }: Props) {
  const customFieldsRef = useRef<CustomFieldsHandle>(null);
  const form = useForm<ProductCategoryFormValues>({
    resolver: zodResolver(productCategoryCreateSchema) as Resolver<ProductCategoryFormValues>,
    defaultValues,
  });
  const { isSubmitting } = useFormState({ control: form.control });
  const watchedValues = useWatch({ control: form.control });

  async function handleSubmit(values: ProductCategoryFormValues) {
    const entityId = await onSubmit(values);
    if (customFieldsRef.current?.hasFields) {
      await customFieldsRef.current.save(entityId);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <FieldSet className="gap-4">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!form.formState.errors.name} className="gap-1.5">
            <FieldLabel htmlFor="pc-name">Name</FieldLabel>
            <FieldContent>
              <Input id="pc-name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </FieldContent>
          </Field>
          <CustomFieldsRenderer
            ref={customFieldsRef}
            entityType="product_category"
            entityId={editingId}
            disabled={isSubmitting}
            nativeValues={watchedValues as Record<string, unknown>}
          />
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
