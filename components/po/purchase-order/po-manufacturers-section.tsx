"use client";

import { Fragment } from "react";
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
import { Pencil } from "lucide-react";
import { PriceView } from "@/components/ui/price-view";

function PivotStepDetails({ row, onEdit }: { row: MoManufacturerPivot; onEdit?: () => void }) {
  const entries: { label: string; value: React.ReactNode }[] = [];

  if (row.depositPaidAt) {
    entries.push({ label: "Deposit paid at", value: formatInvoiceDate(row.depositPaidAt) });
  }
  if (row.depositPaidAmount != null) {
    entries.push({ label: "Deposit amount", value: <PriceView value={row.depositPaidAmount} /> });
  }
  if (row.depositRefNumber) {
    entries.push({ label: "Deposit ref #", value: row.depositRefNumber });
  }
  if (row.depositDocumentKey) {
    entries.push({ label: "Deposit document", value: <PoDocumentLink documentKey={row.depositDocumentKey} /> });
  }
  if (row.depositNote) {
    entries.push({ label: "Deposit note", value: row.depositNote });
  }
  if (row.manufacturingStartedAt) {
    entries.push({ label: "Manufacturing started", value: formatInvoiceDate(row.manufacturingStartedAt) });
  }
  if (row.estimatedCompletionAt) {
    entries.push({ label: "Estimated completion", value: formatInvoiceDate(row.estimatedCompletionAt) });
  }
  if (row.manufacturingNote) {
    entries.push({ label: "Manufacturing note", value: row.manufacturingNote });
  }
  if (row.balancePaidAt) {
    entries.push({ label: "Balance paid at", value: formatInvoiceDate(row.balancePaidAt) });
  }
  if (row.balancePaidAmount != null) {
    entries.push({ label: "Balance amount", value: <PriceView value={row.balancePaidAmount} /> });
  }
  if (row.balanceRefNumber) {
    entries.push({ label: "Balance ref #", value: row.balanceRefNumber });
  }
  if (row.balanceDocumentKey) {
    entries.push({ label: "Balance document", value: <PoDocumentLink documentKey={row.balanceDocumentKey} /> });
  }
  if (row.balanceNote) {
    entries.push({ label: "Balance note", value: row.balanceNote });
  }
  if (row.readyAt) {
    entries.push({ label: "Ready at", value: formatInvoiceDate(row.readyAt) });
  }
  if (row.readyNote) {
    entries.push({ label: "Ready note", value: row.readyNote });
  }
  if (row.pickedUpAt) {
    entries.push({ label: "Picked up at", value: formatInvoiceDate(row.pickedUpAt) });
  }
  if (row.pickedUpNote) {
    entries.push({ label: "Picked up note", value: row.pickedUpNote });
  }

  if (entries.length === 0) return null;

  return (
    <>
      <Separator />
      <div className="flex items-start justify-between gap-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {entries.map((e) => (
            <Fragment key={e.label}>
              <dt className="text-muted-foreground">{e.label}</dt>
              <dd>{e.value}</dd>
            </Fragment>
          ))}
        </dl>
        {onEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
            <span className="sr-only">Edit step details</span>
          </Button>
        ) : null}
      </div>
    </>
  );
}

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
  onEditStepDetails?: (row: MoManufacturerPivot) => void;
  /** Edit manufacturer master record (e.g. from MO detail). */
  onEditManufacturer?: (manufacturerId: string) => void;
  /** Hide the section H2 when a parent provides the title (e.g. collapsible). */
  hideHeading?: boolean;
};

export function PoManufacturersSection({
  manufacturers,
  onPivotStatusChange,
  onCreateInvoice,
  onEditInvoice,
  onEditStepDetails,
  onEditManufacturer,
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
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <CardTitle className="text-base">{row.manufacturer.name}</CardTitle>
                  <CardDescription>{row.manufacturer.region}</CardDescription>
                </div>
                {onEditManufacturer ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    onClick={() => onEditManufacturer(row.manufacturerId)}
                    aria-label="Edit manufacturer"
                  >
                    <Pencil className="size-4" />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
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
              <PivotStepDetails
                row={row}
                onEdit={onEditStepDetails ? () => onEditStepDetails(row) : undefined}
              />
            </CardContent>
          </Card>
        ))}
      </div>
      )}
    </section>
  );
}
