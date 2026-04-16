import type { InvoiceFormValues } from "@/lib/po/invoice-form";

export type InvoicePivotRow = {
  invoice: null | {
    id: string;
    invoiceNumber: string;
    documentKey: string | null;
  };
};

export function invoiceDefaultsForPivot(
  row: InvoicePivotRow,
  mode: "create" | "edit",
): InvoiceFormValues {
  if (mode === "edit" && row.invoice) {
    const inv = row.invoice;
    return {
      invoiceNumber: inv.invoiceNumber,
    };
  }
  return { invoiceNumber: "" };
}
