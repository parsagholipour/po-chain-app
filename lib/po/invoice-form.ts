import { z } from "zod";

export const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1),
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export type InvoiceApiPayload = ReturnType<typeof invoiceFormToApiPayload>;

export function toIsoOrNull(s: string | undefined) {
  if (!s || s.trim() === "") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function invoiceFormToApiPayload(
  values: InvoiceFormValues,
  documentKey: string | null,
) {
  return {
    invoiceNumber: values.invoiceNumber,
    documentKey,
  };
}

export function formatInvoiceDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}
