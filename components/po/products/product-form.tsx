"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";
import { z } from "zod";
import { uploadFileToStorage } from "@/lib/upload-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { ImageFileInput } from "@/components/ui/image-file-input";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import type { Manufacturer } from "@/lib/types/api";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(1, "Required"),
  sku: z.string().min(1, "Required"),
  defaultManufacturerId: z.string().uuid(),
  verified: z.boolean(),
  imageKey: z.string().nullable().optional(),
});

export type ProductFormValues = z.infer<typeof schema>;

type Props = {
  manufacturers: Manufacturer[];
  defaultValues: ProductFormValues;
  onSubmit: (
    values: ProductFormValues,
    meta: { hadNewImageFile: boolean; removeStoredImage: boolean },
  ) => Promise<void>;
  onCancel: () => void;
};

export function ProductForm({
  manufacturers,
  defaultValues,
  onSubmit,
  onCancel,
}: Props) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeStoredImage, setRemoveStoredImage] = useState(false);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });
  const { isSubmitting } = useFormState({ control: form.control });

  const storedImageKey =
    removeStoredImage || imageFile ? null : (defaultValues.imageKey ?? null);

  async function handleSubmit(values: ProductFormValues) {
    let imageKey: string | null;
    if (imageFile) {
      try {
        imageKey = await uploadFileToStorage(imageFile, "products");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
        return;
      }
    } else if (removeStoredImage) {
      imageKey = null;
    } else {
      imageKey = defaultValues.imageKey ?? null;
    }
    await onSubmit(
      { ...values, imageKey },
      {
        hadNewImageFile: imageFile !== null,
        removeStoredImage,
      },
    );
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <FieldSet className="gap-4">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!form.formState.errors.name} className="gap-1.5">
            <FieldLabel htmlFor="pf-name">Name</FieldLabel>
            <FieldContent>
              <Input id="pf-name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.sku} className="gap-1.5">
            <FieldLabel htmlFor="pf-sku">SKU</FieldLabel>
            <FieldContent>
              <Input id="pf-sku" {...form.register("sku")} />
              <FieldError errors={[form.formState.errors.sku]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.defaultManufacturerId} className="gap-1.5">
            <FieldLabel>Default manufacturer</FieldLabel>
            <FieldContent>
              <Controller
                control={form.control}
                name="defaultManufacturerId"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    items={manufacturers.map((m) => ({
                      value: m.id,
                      label: m.name,
                    }))}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Manufacturer" />
                    </SelectTrigger>
                    <SelectContent>
                      {manufacturers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.defaultManufacturerId]} />
            </FieldContent>
          </Field>
          <Field orientation="horizontal" className="gap-2">
            <Controller
              control={form.control}
              name="verified"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              )}
            />
            <FieldLabel className="font-normal">Verified</FieldLabel>
          </Field>
          <Field className="gap-1.5">
            <ImageFileInput
              id="pf-image"
              label="Image"
              variant="image"
              value={imageFile}
              onChange={(file) => {
                setImageFile(file);
                if (file) setRemoveStoredImage(false);
              }}
              existingObjectKey={storedImageKey}
              onRemoveStored={
                defaultValues.imageKey
                  ? () => {
                      setRemoveStoredImage(true);
                      setImageFile(null);
                    }
                  : undefined
              }
              chooseLabel={
                defaultValues.imageKey && !removeStoredImage
                  ? "Replace image"
                  : "Choose image"
              }
            />
          </Field>
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
