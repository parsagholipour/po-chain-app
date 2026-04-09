"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/axios";
import { LineItemCard, LineItemsGrid } from "@/components/po/line-items/line-items-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import type { PoLineRow, PurchaseOrderSummary } from "@/lib/types/api";
import { distributorPoStatusLabels } from "@/lib/po/status-labels";
import { ChevronDown, ChevronRight } from "lucide-react";

export type OrderListLinesApiScope = "purchase-orders" | "stock-orders";

function linesUrl(scope: OrderListLinesApiScope, orderId: string) {
  return scope === "purchase-orders"
    ? `/api/purchase-orders/${orderId}/lines`
    : `/api/stock-orders/${orderId}/lines`;
}

function detailHref(scope: OrderListLinesApiScope, orderId: string) {
  return scope === "purchase-orders"
    ? `/purchase-orders/${orderId}`
    : `/stock-orders/${orderId}`;
}

export function ExpandableOrderSummaryTableHead() {
  return (
    <TableHead className="w-10 p-2">
      <span className="sr-only">Line items</span>
    </TableHead>
  );
}

export function ExpandableOrderSummaryRow({
  row,
  apiScope,
}: {
  row: PurchaseOrderSummary;
  apiScope: OrderListLinesApiScope;
}) {
  const [open, setOpen] = useState(false);
  const href = detailHref(apiScope, row.id);

  const { data: lines, isPending, isError } = useQuery({
    queryKey: ["order-lines", "list-expand", apiScope, row.id] as const,
    queryFn: async () => {
      const { data } = await api.get<PoLineRow[]>(linesUrl(apiScope, row.id));
      return data;
    },
    enabled: open,
  });

  const colSpan = 5;

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
          <Badge variant="secondary">
            {distributorPoStatusLabels[row.status] ?? row.status}
          </Badge>
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
            ) : !lines?.length ? (
              <p className="text-sm text-muted-foreground">No line items.</p>
            ) : (
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <LineItemsGrid dense>
                  {lines.map((line) => (
                    <LineItemCard
                      key={line.id}
                      compact
                      imageKey={line.product.imageKey}
                      title={line.product.name}
                      subtitle={`Qty ${line.quantity} · ${line.product.defaultManufacturer.name}`}
                      footer={
                        <p className="text-start font-mono text-[10px] leading-tight text-muted-foreground">
                          {line.product.sku}
                        </p>
                      }
                    />
                  ))}
                </LineItemsGrid>
              </div>
            )}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
