import { z } from "zod";

export const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1),
  orderDate: z.string().optional(),
  estimatedCompletionDate: z.string().optional(),
  depositPaidAt: z.string().optional(),
  balancePaidAt: z.string().optional(),
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
    orderDate: toIsoOrNull(values.orderDate),
    estimatedCompletionDate: toIsoOrNull(values.estimatedCompletionDate),
    depositPaidAt: toIsoOrNull(values.depositPaidAt),
    balancePaidAt: toIsoOrNull(values.balancePaidAt),
  };
}

export function formatInvoiceDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}
