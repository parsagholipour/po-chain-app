"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PoDocumentLink } from "./po-document-link";

type PoOrderInvoice = null | {
  id: string;
  invoiceNumber: string;
  documentKey: string | null;
};

type Props = {
  invoice: PoOrderInvoice;
  onCreate: () => void;
  onEdit: () => void;
};

export function PoOrderInvoiceSection({ invoice, onCreate, onEdit }: Props) {
  return (
    <Card className="border-border/80 shadow-sm ring-1 ring-border/40">
      <CardHeader className="gap-1 border-b border-border/60 pb-3">
        <CardTitle className="text-base">Invoice</CardTitle>
        <CardDescription>Invoice number and optional document for this order.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {invoice ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">Invoice {invoice.invoiceNumber}</span>
              <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Document</dt>
              <dd>
                <PoDocumentLink documentKey={invoice.documentKey} />
              </dd>
            </dl>
          </div>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={onCreate}>
            Create invoice
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
