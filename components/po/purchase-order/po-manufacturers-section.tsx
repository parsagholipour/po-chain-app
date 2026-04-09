"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { MoManufacturerPivot } from "@/lib/types/api";
import { formatInvoiceDate } from "@/lib/po/invoice-form";
import { PoDocumentLink } from "@/components/po/purchase-order/po-document-link";
import { moManufacturerStatuses, moStatusLabels } from "@/lib/po/status-labels";

const pivotStatusSelectItems = moManufacturerStatuses.map((s) => ({
  value: s,
  label: moStatusLabels[s] ?? s,
}));

function pivotStatusItemsForValue(currentStatus: string) {
  if ((moManufacturerStatuses as readonly string[]).includes(currentStatus)) {
    return pivotStatusSelectItems;
  }
  return [
    { value: currentStatus, label: moStatusLabels[currentStatus] ?? currentStatus },
    ...pivotStatusSelectItems,
  ];
}

type Props = {
  manufacturers: MoManufacturerPivot[];
  onPivotStatusChange: (manufacturerId: string, status: string) => void;
  onCreateInvoice: (row: MoManufacturerPivot) => void;
  onEditInvoice: (row: MoManufacturerPivot) => void;
  /** Hide the section H2 when a parent provides the title (e.g. collapsible). */
  hideHeading?: boolean;
};

export function PoManufacturersSection({
  manufacturers,
  onPivotStatusChange,
  onCreateInvoice,
  onEditInvoice,
  hideHeading = false,
}: Props) {
  return (
    <section
      className="space-y-4"
      aria-labelledby={hideHeading ? undefined : "po-manufacturers-heading"}
      aria-label={hideHeading ? "Manufacturers and invoices" : undefined}
    >
      {!hideHeading ? (
        <h2 id="po-manufacturers-heading" className="text-lg font-semibold">
          Manufacturers & invoices
        </h2>
      ) : null}
      {manufacturers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-12 text-center text-sm text-muted-foreground">
          No manufacturers linked to this order yet.
        </p>
      ) : (
      <div className="grid gap-4 md:grid-cols-2">
        {manufacturers.map((row) => (
          <Card key={row.manufacturerId} className="border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{row.manufacturer.name}</CardTitle>
              <CardDescription>{row.manufacturer.region}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Pivot status</Label>
                <Select
                  value={row.status}
                  items={pivotStatusItemsForValue(row.status)}
                  onValueChange={(v) => {
                    if (v) onPivotStatusChange(row.manufacturerId, v);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {moManufacturerStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {moStatusLabels[s] ?? s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              {row.invoice ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Invoice {row.invoice.invoiceNumber}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEditInvoice(row)}
                    >
                      Edit
                    </Button>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Document</dt>
                    <dd>
                      <PoDocumentLink documentKey={row.invoice.documentKey} />
                    </dd>
                    <dt className="text-muted-foreground">Order date</dt>
                    <dd>{formatInvoiceDate(row.invoice.orderDate)}</dd>
                    <dt className="text-muted-foreground">Est. completion</dt>
                    <dd>{formatInvoiceDate(row.invoice.estimatedCompletionDate)}</dd>
                    <dt className="text-muted-foreground">Deposit paid</dt>
                    <dd>{formatInvoiceDate(row.invoice.depositPaidAt)}</dd>
                    <dt className="text-muted-foreground">Balance paid</dt>
                    <dd>{formatInvoiceDate(row.invoice.balancePaidAt)}</dd>
                  </dl>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onCreateInvoice(row)}
                >
                  Create invoice
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      )}
    </section>
  );
}
