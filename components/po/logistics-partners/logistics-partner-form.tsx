"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm, useFormState, useWatch, type Resolver } from "react-hook-form";
import { z } from "zod";
import { logisticsPartnerCreateSchema } from "@/lib/validations/master-data";
import { uploadFileToStorage } from "@/lib/upload-client";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { ImageFileInput } from "@/components/ui/image-file-input";
import { Input } from "@/components/ui/input";
import { type LogisticsPartnerType } from "@/lib/shipping";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CustomFieldsRenderer,
  type CustomFieldsHandle,
} from "@/components/po/custom-fields/custom-fields-renderer";

export type LogisticsPartnerFormValues = z.infer<typeof logisticsPartnerCreateSchema>;

interface LogisticsPartnerFormProps {
  defaultValues?: Partial<LogisticsPartnerFormValues>;
  editingId?: string | null;
  defaultType?: LogisticsPartnerType;
  onSubmit: (values: LogisticsPartnerFormValues) => Promise<string>;
  isSubmitting?: boolean;
}

function getDefaultFormValues(
  defaultValues: Partial<LogisticsPartnerFormValues> | undefined,
  defaultType: LogisticsPartnerType,
): LogisticsPartnerFormValues {
  return {
    name: defaultValues?.name ?? "",
    logoKey: defaultValues?.logoKey ?? null,
    contactNumber: defaultValues?.contactNumber ?? "",
    link: defaultValues?.link ?? "",
    email: defaultValues?.email ?? "",
    address: defaultValues?.address ?? "",
    notes: defaultValues?.notes ?? "",
    type: defaultValues?.type ?? defaultType,
  };
}

export function LogisticsPartnerForm({
  defaultValues,
  editingId,
  defaultType = "freight_forwarder",
  onSubmit,
  isSubmitting = false,
}: LogisticsPartnerFormProps) {
  const customFieldsRef = useRef<CustomFieldsHandle>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeStoredLogo, setRemoveStoredLogo] = useState(false);

  const form = useForm<LogisticsPartnerFormValues>({
    resolver: zodResolver(logisticsPartnerCreateSchema) as Resolver<LogisticsPartnerFormValues>,
    defaultValues: getDefaultFormValues(defaultValues, defaultType),
  });
  const { isSubmitting: formSubmitting } = useFormState({ control: form.control });
  const watchedValues = useWatch({ control: form.control });

  const storedLogoKey =
    removeStoredLogo || logoFile ? null : (defaultValues?.logoKey ?? null);

  async function handleSubmit(values: LogisticsPartnerFormValues) {
    let logoKey = defaultValues?.logoKey ?? null;
    if (logoFile) {
      try {
        logoKey = await uploadFileToStorage(logoFile, "logistics-partners");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
        return;
      }
    } else if (removeStoredLogo) {
      logoKey = null;
    }

    const entityId = await onSubmit({
      ...values,
      logoKey,
      contactNumber: values.contactNumber ?? null,
      link: values.link ?? null,
      email: values.email ?? null,
      address: values.address ?? null,
      notes: values.notes ?? null,
    });
    if (customFieldsRef.current?.hasFields) {
      await customFieldsRef.current.save(entityId);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <FieldSet>
        <input type="hidden" {...form.register("type")} />

        <Field>
          <FieldLabel>Name</FieldLabel>
          <FieldContent>
            <Input {...form.register("name")} placeholder="Partner name" />
          </FieldContent>
          <FieldError>{form.formState.errors.name?.message}</FieldError>
        </Field>

        <Field>
          <ImageFileInput
            id="logistics-partner-logo"
            label="Logo"
            variant="logo"
            value={logoFile}
            onChange={(file) => {
              setLogoFile(file);
              if (file) setRemoveStoredLogo(false);
            }}
            existingObjectKey={storedLogoKey}
            onRemoveStored={
              defaultValues?.logoKey
                ? () => {
                    setRemoveStoredLogo(true);
                    setLogoFile(null);
                  }
                : undefined
            }
            chooseLabel={
              defaultValues?.logoKey && !removeStoredLogo ? "Replace logo" : "Choose logo"
            }
          />
        </Field>

        <Field>
          <FieldLabel>Contact Number</FieldLabel>
          <FieldContent>
            <Input {...form.register("contactNumber")} placeholder="+971..." />
          </FieldContent>
          <FieldError>{form.formState.errors.contactNumber?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Website Link</FieldLabel>
          <FieldContent>
            <Input {...form.register("link")} placeholder="https://..." />
          </FieldContent>
          <FieldError>{form.formState.errors.link?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Email</FieldLabel>
          <FieldContent>
            <Input {...form.register("email")} placeholder="email@example.com" />
          </FieldContent>
          <FieldError>{form.formState.errors.email?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Address</FieldLabel>
          <FieldContent>
            <Input {...form.register("address")} placeholder="Address" />
          </FieldContent>
          <FieldError>{form.formState.errors.address?.message}</FieldError>
        </Field>

        <Field>
          <FieldLabel>Notes</FieldLabel>
          <FieldContent>
            <Input {...form.register("notes")} placeholder="Notes" />
          </FieldContent>
          <FieldError>{form.formState.errors.notes?.message}</FieldError>
        </Field>

        <CustomFieldsRenderer
          ref={customFieldsRef}
          entityType="logistics_partner"
          entityId={editingId}
          disabled={isSubmitting || formSubmitting}
          nativeValues={watchedValues as Record<string, unknown>}
        />
      </FieldSet>

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || formSubmitting}>
          {isSubmitting || formSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Save"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
