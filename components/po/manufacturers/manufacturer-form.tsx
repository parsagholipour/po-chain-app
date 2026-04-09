"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useFormState } from "react-hook-form";
import { z } from "zod";
import { uploadFileToStorage } from "@/lib/upload-client";
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
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(1, "Required"),
  region: z.string().min(1, "Required"),
  logoKey: z.string().nullable().optional(),
});

export type ManufacturerFormValues = z.infer<typeof schema>;

type Props = {
  defaultValues: ManufacturerFormValues;
  /** Bump when opening the dialog for a different row so fields reset. */
  onSubmit: (values: ManufacturerFormValues) => Promise<void>;
  onCancel: () => void;
};

export function ManufacturerForm({ defaultValues, onSubmit, onCancel }: Props) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeStoredLogo, setRemoveStoredLogo] = useState(false);

  const form = useForm<ManufacturerFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });
  const { isSubmitting } = useFormState({ control: form.control });

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
    await onSubmit({ ...values, logoKey });
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
