"use client";

import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useFormState } from "react-hook-form";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-provider";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import {
  invoiceFormSchema,
  type InvoiceApiPayload,
  type InvoiceFormValues,
  invoiceFormToApiPayload,
} from "@/lib/po/invoice-form";
import { documentDisplayName } from "@/components/po/purchase-order-wizard/wizard-step-basics";
import { presignedFileUrl, uploadFileToStorage } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { Download, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultValues: InvoiceFormValues;
  /** Stored object key when editing an invoice that already has a document. */
  existingDocumentKey: string | null;
  resetToken: string;
  onSubmit: (payload: InvoiceApiPayload) => Promise<void>;
};

type InvoiceUpsertDialogFormProps = {
  defaultValues: InvoiceFormValues;
  existingDocumentKey: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: InvoiceApiPayload) => Promise<void>;
};

function InvoiceUpsertDialogForm({
  defaultValues,
  existingDocumentKey,
  onOpenChange,
  onSubmit,
}: InvoiceUpsertDialogFormProps) {
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues,
  });
  const confirm = useConfirm();
  const { isSubmitting } = useFormState({ control: form.control });

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removedDocument, setRemovedDocument] = useState(false);

  const effectiveKeyForDisplay =
    removedDocument && !pendingFile ? null : pendingFile ? null : existingDocumentKey;
  const displayName = documentDisplayName(effectiveKeyForDisplay, pendingFile);
  const { data: downloadHref, isPending: isPreparingLink } = useQuery({
    queryKey: ["invoice-document-url", effectiveKeyForDisplay],
    queryFn: async () => presignedFileUrl(effectiveKeyForDisplay!),
    enabled: Boolean(effectiveKeyForDisplay),
  });

  return (
        <form
          onSubmit={form.handleSubmit(async (values) => {
            let documentKey: string | null = removedDocument ? null : existingDocumentKey;
            if (pendingFile) {
              try {
                documentKey = await uploadFileToStorage(pendingFile, "invoices");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Upload failed");
                return;
              }
            }
            try {
              await onSubmit(invoiceFormToApiPayload(values, documentKey));
              onOpenChange(false);
            } catch {
              // Parent toasts
            }
          })}
        >
          <FieldSet className="gap-4">
            <FieldGroup className="gap-3">
              <Field className="gap-1.5">
                <FieldLabel>Invoice #</FieldLabel>
                <FieldContent>
                  <Input {...form.register("invoiceNumber")} />
                  <FieldError errors={[form.formState.errors.invoiceNumber]} />
                </FieldContent>
              </Field>
              <Field className="gap-1.5">
                <FieldLabel>Order date</FieldLabel>
                <Input type="datetime-local" {...form.register("orderDate")} />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel>Est. completion</FieldLabel>
                <Input
                  type="datetime-local"
                  {...form.register("estimatedCompletionDate")}
                />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel>Deposit paid</FieldLabel>
                <Input type="datetime-local" {...form.register("depositPaidAt")} />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel>Balance paid</FieldLabel>
                <Input type="datetime-local" {...form.register("balancePaidAt")} />
              </Field>
              <div className="space-y-2">
                <Label htmlFor="invoice-doc">Document (optional)</Label>
                <Input
                  id="invoice-doc"
                  type="file"
                  disabled={isSubmitting}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setPendingFile(file);
                    if (file) setRemovedDocument(false);
                  }}
                />
                {displayName ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">File:</span>
                    <span className="break-all font-medium">{displayName}</span>
                    {effectiveKeyForDisplay && downloadHref ? (
                      <a
                        href={downloadHref}
                        download={displayName}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "h-8 gap-1.5",
                        )}
                      >
                        <Download className="size-3.5" />
                        Download
                      </a>
                    ) : effectiveKeyForDisplay && isPreparingLink ? (
                      <span className="text-xs text-muted-foreground">Preparing link...</span>
                    ) : null}
                  </div>
                ) : null}
                {existingDocumentKey && !pendingFile && !removedDocument ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: "Remove this document?",
                          description: "The stored invoice document will be cleared when you save this invoice.",
                          confirmLabel: "Remove",
                          variant: "destructive",
                        });
                        if (!ok) return;
                        setRemovedDocument(true);
                        setPendingFile(null);
                      })();
                    }}
                  >
                    Remove document
                  </Button>
                ) : null}
                {pendingFile ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setPendingFile(null)}
                  >
                    Clear new file
                  </Button>
                ) : null}
              </div>
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
  );
}

export function InvoiceUpsertDialog({
  open,
  onOpenChange,
  title,
  defaultValues,
  existingDocumentKey,
  resetToken,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <InvoiceUpsertDialogForm
          key={`${resetToken}-${open ? "open" : "closed"}`}
          defaultValues={defaultValues}
          existingDocumentKey={existingDocumentKey}
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
