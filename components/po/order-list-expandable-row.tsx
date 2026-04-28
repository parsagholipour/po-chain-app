"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/axios";
import { LineItemCard, LineItemsGrid } from "@/components/po/line-items/line-items-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import type { PoLineRow, Product, PurchaseOrderSummary } from "@/lib/types/api";
import {
  distributorPoStatusLabels,
  moStatusLabels,
  shippingStatusLabels,
  statusBadgeClassName,
} from "@/lib/po/status-labels";
import { ChevronDown, ChevronRight, Loader2, Trash2 } from "lucide-react";

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
  onEditProduct,
  onDelete,
  isDeleting = false,
}: {
  row: PurchaseOrderSummary;
  apiScope: OrderListLinesApiScope;
  onEditProduct?: (product: Product) => void;
  onDelete?: (id: string) => Promise<void>;
  isDeleting?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const href = detailHref(apiScope, row.id);
  const isStockList = apiScope === "stock-orders";
  const orderKindLabel = isStockList ? "stock order" : "purchase order";

  const { data: lines, isPending, isError } = useQuery({
    queryKey: ["order-lines", "list-expand", apiScope, row.id] as const,
    queryFn: async () => {
      const { data } = await api.get<PoLineRow[]>(linesUrl(apiScope, row.id));
      return data;
    },
    enabled: open,
  });

  const baseColumnCount = isStockList ? 5 : 6;
  const colSpan = baseColumnCount + (onDelete ? 1 : 0);

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
        <TableCell>
          <Link href={href} className="font-medium hover:underline">
            {row.name}
          </Link>
        </TableCell>
        {!isStockList ? (
          <>
            <TableCell className="text-muted-foreground">
              {row.saleChannel?.name ?? "—"}
            </TableCell>
            <TableCell>
              {row.manufacturingOrders.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {row.manufacturingOrders.map((mo) => (
                    <div key={mo.id} className="flex items-center gap-1.5">
                      <Link href={`/manufacturing-orders/${mo.id}`} className="text-xs hover:underline">
                        {mo.name}
                      </Link>
                      <Badge
                        variant="outline"
                        className={`${statusBadgeClassName(mo.status)} text-[10px] font-medium`}
                      >
                        {moStatusLabels[mo.status] ?? mo.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </>
        ) : null}
        <TableCell>
          <div className="flex flex-col gap-1.5">
            <Badge variant="secondary" className={statusBadgeClassName(row.status)}>
              {distributorPoStatusLabels[row.status] ?? row.status}
            </Badge>
            {row.shippingBadges && row.shippingBadges.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-foreground">Shipping</span>
                {row.shippingBadges.map((s) => (
                  <Badge
                    key={s.id}
                    variant="outline"
                    className={`${statusBadgeClassName(s.status)} text-[10px] font-medium`}
                  >
                    {shippingStatusLabels[s.status] ?? s.status}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {new Date(row.createdAt).toLocaleDateString()}
        </TableCell>
        {onDelete ? (
          <TableCell className="w-12 p-1 align-middle">
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogTrigger
                nativeButton
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={isDeleting}
                  />
                }
              >
                <Trash2 className="size-4" aria-hidden />
                <span className="sr-only">Delete {orderKindLabel}</span>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this {orderKindLabel}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {`This permanently removes "${row.name}" and all its line items. Links from manufacturing orders and MO line allocations for those lines are removed. Manufacturing orders themselves are kept.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isDeleting}
                    onClick={async () => {
                      try {
                        await onDelete(row.id);
                        setDeleteOpen(false);
                      } catch {
                        /* toast from mutation */
                      }
                    }}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                        Deleting…
                      </>
                    ) : (
                      "Delete"
                    )}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TableCell>
        ) : null}
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
                      subtitle={
                        line.quantity !== line.orderedQuantity
                          ? `Ordered ${line.orderedQuantity} · Effective ${line.quantity} · ${line.product.defaultManufacturer.name}`
                          : `Qty ${line.quantity} · ${line.product.defaultManufacturer.name}`
                      }
                      onEditProduct={onEditProduct ? () => onEditProduct(line.product) : undefined}
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
