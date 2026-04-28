"use client";

import { useRef, type FormEvent } from "react";
import { useForm, useFormState, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { productTypeCreateSchema } from "@/lib/validations/master-data";
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

export type ProductTypeFormValues = z.infer<typeof productTypeCreateSchema>;

export function emptyProductTypeFormValues(): ProductTypeFormValues {
  return { name: "" };
}

type Props = {
  defaultValues: ProductTypeFormValues;
  editingId?: string | null;
  onSubmit: (values: ProductTypeFormValues) => Promise<string>;
  onCancel: () => void;
};

export function ProductTypeForm({ defaultValues, editingId, onSubmit, onCancel }: Props) {
  const customFieldsRef = useRef<CustomFieldsHandle>(null);
  const form = useForm<ProductTypeFormValues>({
    resolver: zodResolver(productTypeCreateSchema) as Resolver<ProductTypeFormValues>,
    defaultValues,
  });
  const { isSubmitting } = useFormState({ control: form.control });
  const watchedValues = useWatch({ control: form.control });

  async function handleSubmit(values: ProductTypeFormValues) {
    const entityId = await onSubmit(values);
    if (customFieldsRef.current?.hasFields) {
      await customFieldsRef.current.save(entityId);
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    void form.handleSubmit(handleSubmit)(event);
  }

  return (
    <form onSubmit={handleFormSubmit}>
      <FieldSet className="gap-4">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!form.formState.errors.name} className="gap-1.5">
            <FieldLabel htmlFor="pt-name">Name</FieldLabel>
            <FieldContent>
              <Input id="pt-name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </FieldContent>
          </Field>
          <CustomFieldsRenderer
            ref={customFieldsRef}
            entityType="product_type"
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
