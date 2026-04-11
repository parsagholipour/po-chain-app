"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/axios";
import { LineItemCard, LineItemsGrid } from "@/components/po/line-items/line-items-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import type { ManufacturingOrderDetail, ManufacturingOrderSummary, Product } from "@/lib/types/api";
import { moStatusLabels, shippingStatusLabels } from "@/lib/po/status-labels";
import { ChevronDown, ChevronRight } from "lucide-react";

export function ExpandableMoTableHead() {
  return (
    <TableHead className="w-10 p-2">
      <span className="sr-only">Line items</span>
    </TableHead>
  );
}

export function ExpandableManufacturingOrderSummaryRow({
  row,
  onEditProduct,
}: {
  row: ManufacturingOrderSummary;
  onEditProduct?: (product: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const href = `/manufacturing-orders/${row.id}`;

  const { data: mo, isPending, isError } = useQuery({
    queryKey: ["manufacturing-order", row.id] as const,
    queryFn: async () => {
      const { data } = await api.get<ManufacturingOrderDetail>(
        `/api/manufacturing-orders/${row.id}`,
      );
      return data;
    },
    enabled: open,
  });

  const colSpan = 5;
  const allocations = mo?.lineAllocations ?? [];

  return (
    <>
      <TableRow>
        <TableCell className="w-10 p-1 align-middle">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            aria-expanded={open}
            aria-label={open ? "Hide line items" : "Show line items"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
          </Button>
        </TableCell>
        <TableCell className="font-mono font-medium">
          <Link href={href} className="text-primary underline-offset-4 hover:underline">
            {row.number}
          </Link>
        </TableCell>
        <TableCell>
          <Link href={href} className="font-medium hover:underline">
            {row.name}
          </Link>
        </TableCell>
        <TableCell>
          {row.manufacturers.length > 0 ? (
            <div className="flex max-w-md flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-foreground">MO</span>
                <Badge variant="secondary" className="shrink-0 text-[10px] font-medium">
                  {moStatusLabels[row.status] ?? row.status}
                </Badge>
              </div>
              <ul className="flex flex-col gap-1.5 border-t border-border/60 pt-2">
                {row.manufacturers.map((m) => (
                  <li key={m.manufacturerId} className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="min-w-0 max-w-[10rem] truncate text-xs text-muted-foreground"
                      title={m.name}
                    >
                      {m.name}
                    </span>
                    <Badge variant="secondary" className="shrink-0 text-[10px] font-medium">
                      {moStatusLabels[m.status] ?? m.status}
                    </Badge>
                  </li>
                ))}
              </ul>
              {row.shippingBadges && row.shippingBadges.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
                  <span className="text-xs font-medium text-foreground">Shipping</span>
                  {row.shippingBadges.map((s) => (
                    <Badge key={s.id} variant="outline" className="shrink-0 text-[10px] font-medium">
                      {shippingStatusLabels[s.status] ?? s.status}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Badge variant="secondary">{moStatusLabels[row.status] ?? row.status}</Badge>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {new Date(row.createdAt).toLocaleDateString()}
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colSpan} className="border-t border-border/60 bg-muted/15 p-3 pt-2">
            {isPending ? (
              <p className="text-sm text-muted-foreground">Loading line items…</p>
            ) : isError ? (
              <p className="text-sm text-destructive">Could not load line items.</p>
            ) : allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No line allocations yet.</p>
            ) : (
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <LineItemsGrid dense>
                  {allocations.map((a) => {
                    const po = a.purchaseOrderLine.purchaseOrder;
                    const prefix = po.type === "stock" ? "SO" : "PO";
                    return (
                      <LineItemCard
                        key={a.purchaseOrderLineId}
                        compact
                        imageKey={a.purchaseOrderLine.product.imageKey}
                        title={a.purchaseOrderLine.product.name}
                        subtitle={`Qty ${a.purchaseOrderLine.quantity} · ${a.manufacturer.name}`}
                        onEditProduct={onEditProduct ? () => onEditProduct(a.purchaseOrderLine.product) : undefined}
                        footer={
                          <div className="space-y-1 text-start text-[10px] leading-tight text-muted-foreground">
                            <p className="font-mono">{prefix} #{po.number}</p>
                            <p className="line-clamp-2 leading-snug">{po.name}</p>
                            <p className="font-mono">{a.purchaseOrderLine.product.sku}</p>
                          </div>
                        }
                      />
                    );
                  })}
                </LineItemsGrid>
              </div>
            )}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
