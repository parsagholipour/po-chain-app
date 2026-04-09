"use client";

import { useEffect } from "react";
import { useForm, useFormState } from "react-hook-form";
import { toast } from "sonner";
import { uploadFileToStorage } from "@/lib/upload-client";
import { Button } from "@/components/ui/button";
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
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

type ShipmentFormValues = {
  trackingNumber: string;
  shippedAt: string;
  file: File | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: {
    trackingNumber: string;
    shippedAt: string;
    invoiceDocumentKey?: string | null;
  }) => Promise<void>;
};

const empty: ShipmentFormValues = {
  trackingNumber: "",
  shippedAt: "",
  file: null,
};

export function AddShipmentDialog({ open, onOpenChange, onSubmit }: Props) {
  const form = useForm<ShipmentFormValues>({ defaultValues: empty });
  const { isSubmitting } = useFormState({ control: form.control });

  useEffect(() => {
    if (open) {
      form.reset(empty);
    }
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add shipment</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(async (vals) => {
            let key: string | null = null;
            if (vals.file) {
              try {
                key = await uploadFileToStorage(vals.file, "shippings");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Upload failed");
                return;
              }
            }
            try {
              await onSubmit({
                trackingNumber: vals.trackingNumber,
                shippedAt: new Date(vals.shippedAt).toISOString(),
                invoiceDocumentKey: key,
              });
              onOpenChange(false);
            } catch {
              // Parent toasts
            }
          })}
        >
          <FieldSet className="gap-4">
            <FieldGroup className="gap-3">
              <Field className="gap-1.5">
                <FieldLabel>Tracking #</FieldLabel>
                <FieldContent>
                  <Input {...form.register("trackingNumber", { required: true })} />
                </FieldContent>
              </Field>
              <Field className="gap-1.5">
                <FieldLabel>Ship date</FieldLabel>
                <FieldContent>
                  <Input
                    type="datetime-local"
                    {...form.register("shippedAt", { required: true })}
                  />
                </FieldContent>
              </Field>
              <Field className="gap-1.5">
                <FieldLabel>Document (optional)</FieldLabel>
                <FieldContent>
                  <Input
                    type="file"
                    onChange={(e) =>
                      form.setValue("file", e.target.files?.[0] ?? null)
                    }
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </FieldSet>
          <DialogFooter className="mt-4 border-0 bg-transparent">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
