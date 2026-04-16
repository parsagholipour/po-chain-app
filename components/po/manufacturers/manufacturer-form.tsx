"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm, useFormState, useWatch, type Resolver } from "react-hook-form";
import { z } from "zod";
import { uploadFileToStorage } from "@/lib/upload-client";
import { manufacturerCreateSchema } from "@/lib/validations/master-data";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CustomFieldsRenderer,
  type CustomFieldsHandle,
} from "@/components/po/custom-fields/custom-fields-renderer";

export type ManufacturerFormValues = z.infer<typeof manufacturerCreateSchema>;

export function emptyManufacturerFormValues(): ManufacturerFormValues {
  return {
    name: "",
    region: "",
    logoKey: null,
    contactNumber: "",
    address: "",
    email: "",
    link: "",
    notes: "",
  };
}

type Props = {
  defaultValues: ManufacturerFormValues;
  editingId?: string | null;
  onSubmit: (values: ManufacturerFormValues) => Promise<string>;
  onCancel: () => void;
};

export function ManufacturerForm({ defaultValues, editingId, onSubmit, onCancel }: Props) {
  const customFieldsRef = useRef<CustomFieldsHandle>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeStoredLogo, setRemoveStoredLogo] = useState(false);

  const form = useForm<ManufacturerFormValues>({
    resolver: zodResolver(manufacturerCreateSchema) as Resolver<ManufacturerFormValues>,
    defaultValues,
  });
  const { isSubmitting } = useFormState({ control: form.control });
  const watchedValues = useWatch({ control: form.control });

  const storedLogoKey =
    removeStoredLogo || logoFile ? null : (defaultValues.logoKey ?? null);

  async function handleSubmit(values: ManufacturerFormValues) {
    let logoKey: string | null;
    if (logoFile) {
      try {
        logoKey = await uploadFileToStorage(logoFile, "manufacturers");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
        return;
      }
    } else if (removeStoredLogo) {
      logoKey = null;
    } else {
      logoKey = defaultValues.logoKey ?? null;
    }
    const entityId = await onSubmit({ ...values, logoKey });
    if (customFieldsRef.current?.hasFields) {
      await customFieldsRef.current.save(entityId);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <FieldSet className="gap-4">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!form.formState.errors.name} className="gap-1.5">
            <FieldLabel htmlFor="mf-name">Name</FieldLabel>
            <FieldContent>
              <Input id="mf-name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.region} className="gap-1.5">
            <FieldLabel htmlFor="mf-region">Region</FieldLabel>
            <FieldContent>
              <Input id="mf-region" {...form.register("region")} />
              <FieldError errors={[form.formState.errors.region]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.contactNumber} className="gap-1.5">
            <FieldLabel htmlFor="mf-contact">Contact number</FieldLabel>
            <FieldContent>
              <Input id="mf-contact" {...form.register("contactNumber")} placeholder="+971…" />
              <FieldError errors={[form.formState.errors.contactNumber]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.email} className="gap-1.5">
            <FieldLabel htmlFor="mf-email">Email</FieldLabel>
            <FieldContent>
              <Input id="mf-email" type="email" {...form.register("email")} placeholder="name@example.com" />
              <FieldError errors={[form.formState.errors.email]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.link} className="gap-1.5">
            <FieldLabel htmlFor="mf-link">Link</FieldLabel>
            <FieldContent>
              <Input id="mf-link" {...form.register("link")} placeholder="https://…" />
              <FieldError errors={[form.formState.errors.link]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.address} className="gap-1.5">
            <FieldLabel htmlFor="mf-address">Address</FieldLabel>
            <FieldContent>
              <Textarea id="mf-address" rows={3} {...form.register("address")} placeholder="Street, city…" />
              <FieldError errors={[form.formState.errors.address]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.notes} className="gap-1.5">
            <FieldLabel htmlFor="mf-notes">Notes</FieldLabel>
            <FieldContent>
              <Textarea id="mf-notes" rows={3} {...form.register("notes")} />
              <FieldError errors={[form.formState.errors.notes]} />
            </FieldContent>
          </Field>
          <Field className="gap-1.5">
            <ImageFileInput
              id="mf-logo"
              label="Logo"
              variant="logo"
              value={logoFile}
              onChange={(file) => {
                setLogoFile(file);
                if (file) setRemoveStoredLogo(false);
              }}
              existingObjectKey={storedLogoKey}
              onRemoveStored={
                defaultValues.logoKey
                  ? () => {
                      setRemoveStoredLogo(true);
                      setLogoFile(null);
                    }
                  : undefined
              }
              chooseLabel={
                defaultValues.logoKey && !removeStoredLogo
                  ? "Replace logo"
                  : "Choose logo"
              }
            />
          </Field>
          <CustomFieldsRenderer
            ref={customFieldsRef}
            entityType="manufacturer"
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
