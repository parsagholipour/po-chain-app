import type { InvoiceFormValues } from "@/lib/po/invoice-form";

export type InvoicePivotRow = {
  invoice: null | {
    id: string;
    invoiceNumber: string;
    documentKey: string | null;
    orderDate: string | null;
    estimatedCompletionDate: string | null;
    depositPaidAt: string | null;
    balancePaidAt: string | null;
  };
};

function sliceLocal(iso: string | null) {
  return iso ? iso.slice(0, 16) : "";
}

export function invoiceDefaultsForPivot(
  row: InvoicePivotRow,
  mode: "create" | "edit",
): InvoiceFormValues {
  if (mode === "edit" && row.invoice) {
    const inv = row.invoice;
    return {
      invoiceNumber: inv.invoiceNumber,
      orderDate: sliceLocal(inv.orderDate),
      estimatedCompletionDate: sliceLocal(inv.estimatedCompletionDate),
      depositPaidAt: sliceLocal(inv.depositPaidAt),
      balancePaidAt: sliceLocal(inv.balancePaidAt),
    };
  }
  return { invoiceNumber: "" };
}
