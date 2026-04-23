"use client";

import { useMemo } from "react";
import { useConfirm } from "@/components/confirm-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import { MoLinkedOrderLabel } from "@/components/po/mo-linked-order-label";
import { TablePagination } from "@/components/ui/table-pagination";
import type { MoLineAllocationRow, MoManufacturerPivot } from "@/lib/types/api";
import { usePagination } from "@/hooks/use-pagination";
import { Plus, Trash2 } from "lucide-react";

type Props = {
  allocations: MoLineAllocationRow[];
  manufacturerOptions: MoManufacturerPivot[];
  onAdd: () => void;
  onPatch: (
    purchaseOrderLineId: string,
    body: { manufacturerId?: string; verified?: boolean },
  ) => void;
  onDelete: (purchaseOrderLineId: string) => void;
  busy?: boolean;
  /** Hide title row and Add button when the parent supplies them (e.g. collapsible header). */
  hideToolbar?: boolean;
};

export function MoAllocationsSection({
  allocations,
  manufacturerOptions,
  onAdd,
  onPatch,
  onDelete,
  busy = false,
  hideToolbar = false,
}: Props) {
  const confirm = useConfirm();
  const manufacturerSelectItems = useMemo(
    () =>
      manufacturerOptions.map((m) => ({
        value: m.manufacturerId,
        label: m.manufacturer.name,
      })),
    [manufacturerOptions],
  );
  const pagination = usePagination({ totalItems: allocations.length });
  const pagedAllocations = pagination.sliceItems(allocations);

  return (
    <section
      className="space-y-4"
      aria-labelledby={hideToolbar ? undefined : "mo-alloc-heading"}
      aria-label={hideToolbar ? "Line allocations" : undefined}
    >
      {!hideToolbar ? (
        <div className="flex items-center justify-between gap-4">
          <h2 id="mo-alloc-heading" className="text-lg font-semibold">
            Line allocations
          </h2>
          <Button type="button" size="sm" onClick={onAdd} disabled={busy}>
            <Plus className="size-4" />
            Add allocation
          </Button>
        </div>
      ) : null}
      {allocations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-12 text-center text-sm text-muted-foreground">
          Link purchase or stock orders, then assign lines to manufacturers with optional verification.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order / Product</TableHead>
                <TableHead className="w-24">Qty</TableHead>
                <TableHead className="min-w-[10rem]">Manufacturer</TableHead>
                <TableHead className="w-28">Verified</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedAllocations.map((row) => (
                <TableRow key={row.purchaseOrderLineId}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <StorageObjectImage
                        reference={row.purchaseOrderLine.product.imageKey}
                        alt=""
                        className="size-11 shrink-0 rounded-md"
                        imgClassName="rounded-md"
                        objectFit="contain"
                      />
                      <div className="min-w-0 text-sm">
                        <div className="min-w-0 text-xs text-muted-foreground">
                          <MoLinkedOrderLabel
                            type={row.purchaseOrderLine.purchaseOrder.type}
                            name={row.purchaseOrderLine.purchaseOrder.name}
                            saleChannelName={
                              row.purchaseOrderLine.purchaseOrder.saleChannel?.name ?? null
                            }
                            className="text-xs text-muted-foreground"
                          />
                        </div>
                        <div className="font-medium">{row.purchaseOrderLine.product.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {row.purchaseOrderLine.product.sku}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{row.purchaseOrderLine.quantity}</TableCell>
                  <TableCell>
                    <Select
                      value={row.manufacturerId}
                      items={manufacturerSelectItems}
                      disabled={busy || manufacturerOptions.length === 0}
                      onValueChange={(v) => {
                        if (v) onPatch(row.purchaseOrderLineId, { manufacturerId: v });
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {manufacturerOptions.map((m) => (
                          <SelectItem key={m.manufacturerId} value={m.manufacturerId}>
                            {m.manufacturer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`ver-${row.purchaseOrderLineId}`}
                        checked={row.verified}
                        disabled={busy}
                        onCheckedChange={(c) =>
                          onPatch(row.purchaseOrderLineId, { verified: c === true })
                        }
                        label={
                          <span className="text-xs font-normal">
                            Verified
                          </span>
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      onClick={() => {
                        void (async () => {
                          const orderPrefix =
                            row.purchaseOrderLine.purchaseOrder.type === "stock" ? "SO" : "PO";
                          const po = row.purchaseOrderLine.purchaseOrder;
                          const poLabel = [
                            `${orderPrefix} ${po.name}`,
                            po.saleChannel?.name,
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          const ok = await confirm({
                            title: "Delete this allocation?",
                            description: `${poLabel} — ${row.purchaseOrderLine.product.name}`,
                            confirmLabel: "Delete",
                            variant: "destructive",
                          });
                          if (ok) onDelete(row.purchaseOrderLineId);
                        })();
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t border-border/60 px-3 py-2">
            <TablePagination
              {...pagination}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </div>
        </div>
      )}
    </section>
  );
}
