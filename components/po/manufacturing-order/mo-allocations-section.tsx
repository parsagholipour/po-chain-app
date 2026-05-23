"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useConfirm } from "@/components/confirm-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PriceField } from "@/components/ui/price-field";
import { PriceView } from "@/components/ui/price-view";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import type { MoLineAllocationRow, MoManufacturerPivot, Product } from "@/lib/types/api";
import { usePagination } from "@/hooks/use-pagination";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

type Props = {
  allocations: MoLineAllocationRow[];
  manufacturerOptions: MoManufacturerPivot[];
  onAdd: () => void;
  onPatch: (
    purchaseOrderLineId: string,
    body: {
      manufacturerId?: string;
      quantity?: number;
      verified?: boolean;
      cost?: number | null;
    },
  ) => void;
  onDelete: (purchaseOrderLineId: string) => void;
  onEditProduct?: (product: Product) => void;
  busy?: boolean;
  /** Hide title row and Add button when the parent supplies them (e.g. collapsible header). */
  hideToolbar?: boolean;
};

function moneyInputValue(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

export function MoAllocationsSection({
  allocations,
  manufacturerOptions,
  onAdd,
  onPatch,
  onDelete,
  onEditProduct,
  busy = false,
  hideToolbar = false,
}: Props) {
  const confirm = useConfirm();
  const [costEditor, setCostEditor] = useState<MoLineAllocationRow | null>(null);
  const [costValue, setCostValue] = useState("");
  const [costError, setCostError] = useState<string | null>(null);
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
  const editingProduct = costEditor?.purchaseOrderLine.product;

  function openCostEditor(row: MoLineAllocationRow) {
    setCostEditor(row);
    setCostValue(moneyInputValue(row.cost));
    setCostError(null);
  }

  function submitCostEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!costEditor) return;

    const trimmed = costValue.trim();
    const cost = trimmed === "" ? null : Number(trimmed);
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      setCostError("Enter a valid non-negative cost.");
      return;
    }

    onPatch(costEditor.purchaseOrderLineId, {
      cost: cost === null ? null : Number(cost.toFixed(2)),
    });
    setCostEditor(null);
  }

  return (
    <>
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
                <TableHead className="w-36 text-end">Cost</TableHead>
                <TableHead className="min-w-[10rem]">Manufacturer</TableHead>
                <TableHead className="w-28">Verified</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedAllocations.map((row) => {
                const product = row.purchaseOrderLine.product;
                const openProduct = onEditProduct ? () => onEditProduct(product) : undefined;

                return (
                  <TableRow key={row.purchaseOrderLineId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {openProduct ? (
                          <button
                            type="button"
                            className="shrink-0 rounded-md text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onClick={openProduct}
                            aria-label={`Edit product ${product.name}`}
                          >
                            <StorageObjectImage
                              reference={product.imageKey}
                              alt=""
                              className="size-11 rounded-md"
                              imgClassName="rounded-md"
                              objectFit="contain"
                            />
                          </button>
                        ) : (
                          <StorageObjectImage
                            reference={product.imageKey}
                            alt=""
                            className="size-11 shrink-0 rounded-md"
                            imgClassName="rounded-md"
                            objectFit="contain"
                          />
                        )}
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
                        {openProduct ? (
                          <button
                            type="button"
                            className="min-w-0 text-left font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onClick={openProduct}
                          >
                            {product.name}
                          </button>
                        ) : (
                          <div className="font-medium">{product.name}</div>
                        )}
                        <div className="text-xs text-muted-foreground font-mono">
                          {product.sku}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      key={`${row.purchaseOrderLineId}-${row.quantity}`}
                      type="number"
                      min={1}
                      defaultValue={row.quantity}
                      disabled={busy}
                      onBlur={(event) => {
                        const quantity = Math.max(1, Number(event.target.value) || 1);
                        if (quantity !== row.quantity) {
                          onPatch(row.purchaseOrderLineId, { quantity });
                        }
                      }}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Source {row.purchaseOrderLine.quantity}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <PriceView value={row.cost} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy}
                        onClick={() => openCostEditor(row)}
                        aria-label={`Edit cost for ${product.name}`}
                        title="Edit cost"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.manufacturerId}
                      items={manufacturerSelectItems}
                      disabled={busy || manufacturerOptions.length === 0}
                      onValueChange={(v) => {
                        if (v) onPatch(row.purchaseOrderLineId, { manufacturerId: v });
                      }}
                    >
                      <SelectTrigger className="w-full max-w-30">
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
                );
              })}
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

      <Dialog
        open={!!costEditor}
        onOpenChange={(open) => {
          if (!open) setCostEditor(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit cost</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitCostEdit}>
            {editingProduct ? (
              <div className="min-w-0 space-y-1">
                <div className="truncate text-sm font-medium">{editingProduct.name}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {editingProduct.sku}
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="mo-allocation-cost">Cost</Label>
              <PriceField
                id="mo-allocation-cost"
                value={costValue}
                disabled={busy}
                placeholder="0.00"
                onChange={(event) => {
                  setCostValue(event.target.value);
                  setCostError(null);
                }}
              />
              {costError ? (
                <p className="text-xs text-destructive">{costError}</p>
              ) : null}
            </div>
            <DialogFooter className="border-0 bg-transparent">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setCostEditor(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
