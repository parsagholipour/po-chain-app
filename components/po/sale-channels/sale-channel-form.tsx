"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { saleChannelTypeLabels } from "@/lib/po/sale-channel-labels";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const saleChannelTypeSelectItems = (
  ["distributor", "amazon", "cjdropshipping"] as const
).map((t) => ({ value: t, label: saleChannelTypeLabels[t] }));

const schema = z.object({
  name: z.string().min(1, "Required"),
  logoKey: z.string().nullable().optional(),
  type: z.enum(["distributor", "amazon", "cjdropshipping"]),
});

export type SaleChannelFormValues = z.infer<typeof schema>;

type Props = {
  defaultValues: SaleChannelFormValues;
  onSubmit: (values: SaleChannelFormValues) => Promise<void>;
  onCancel: () => void;
};

export function SaleChannelForm({ defaultValues, onSubmit, onCancel }: Props) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeStoredLogo, setRemoveStoredLogo] = useState(false);

  const form = useForm<SaleChannelFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });
  const { isSubmitting } = useFormState({ control: form.control });

  const storedLogoKey =
    removeStoredLogo || logoFile ? null : (defaultValues.logoKey ?? null);

  async function handleSubmit(values: SaleChannelFormValues) {
    let logoKey: string | null;
    if (logoFile) {
      try {
        logoKey = await uploadFileToStorage(logoFile, "sale-channels");
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
            <FieldLabel htmlFor="scf-name">Name</FieldLabel>
            <FieldContent>
              <Input id="scf-name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
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
                    items={saleChannelTypeSelectItems}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="distributor">Distributor</SelectItem>
                      <SelectItem value="amazon">Amazon</SelectItem>
                      <SelectItem value="cjdropshipping">CJ Dropshipping</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.type]} />
            </FieldContent>
          </Field>
          <Field className="gap-1.5">
            <ImageFileInput
              id="scf-logo"
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
