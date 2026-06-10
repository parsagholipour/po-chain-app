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
import { TableCell, TableRow } from "@/components/ui/table";
import type { PoLineRow, Product, PurchaseOrderSummary } from "@/lib/types/api";
import {
  distributorPoStatusLabels,
  moStatusLabels,
  shippingStatusLabels,
  statusBadgeClassName,
  warehouseOrderStatusLabels,
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

export function ExpandableOrderSummaryRow({
  row,
  apiScope,
  onEditProduct,
  viewOnly = false,
  hideManufacturingDetails = false,
  showTrackingNumberColumn = false,
  onDelete,
  isDeleting = false,
}: {
  row: PurchaseOrderSummary;
  apiScope: OrderListLinesApiScope;
  onEditProduct?: (product: Product) => void;
  viewOnly?: boolean;
  hideManufacturingDetails?: boolean;
  showTrackingNumberColumn?: boolean;
  onDelete?: (id: string) => Promise<void>;
  isDeleting?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const href = detailHref(apiScope, row.id);
  const isStockList = apiScope === "stock-orders";
  const orderKindLabel = isStockList ? "stock order" : "purchase order";
  const locationName = row.saleChannelLocation?.name ?? row.shipToLocationName ?? null;
  const showTrackingNumbers = showTrackingNumberColumn && !isStockList;
  const trackingNumbers = Array.from(
    new Set(
      row.shippingBadges
        .map((shipping) => shipping.trackingNumber.trim())
        .filter((trackingNumber) => trackingNumber.length > 0),
    ),
  );

  function lineItemSubtitle(line: PoLineRow) {
    if (hideManufacturingDetails) {
      return `Ordered: ${line.orderedQuantity}`;
    }
    if (line.quantity !== line.orderedQuantity) {
      return `Ordered ${line.orderedQuantity} · Effective ${line.quantity} · ${line.product.defaultManufacturer.name}`;
    }
    return `Qty ${line.quantity} · ${line.product.defaultManufacturer.name}`;
  }

  const { data: lines, isPending, isError } = useQuery({
    queryKey: ["order-lines", "list-expand", apiScope, row.id] as const,
    queryFn: async () => {
      const { data } = await api.get<PoLineRow[]>(linesUrl(apiScope, row.id));
      return data;
    },
    enabled: open,
  });

  const baseColumnCount = isStockList ? 4 : showTrackingNumbers ? 7 : 6;
  const colSpan = baseColumnCount + (onDelete ? 1 : 0);

  return (
    <>
      <TableRow>
        <TableCell className="min-w-0 overflow-hidden">
          <div className="flex min-w-0 items-start gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-ml-1.5 size-7 shrink-0 text-muted-foreground"
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
            <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link
                href={href}
                className="block min-w-0 truncate font-medium hover:underline"
                title={row.name}
              >
                {row.name}
              </Link>
              {row.isBackOrder ? (
                <Badge
                  variant="outline"
                  className="w-fit max-w-full shrink-0 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                >
                  Back Order
                </Badge>
              ) : null}
            </div>
            {row.actualizedPo ? (
              <Link
                href={`/purchase-orders/${row.actualizedPo.id}`}
                className="block min-w-0 truncate text-xs font-medium text-primary underline-offset-4 hover:underline"
                title={`Actualized as PO #${row.actualizedPo.number}`}
              >
                Actualized as PO #{row.actualizedPo.number}
              </Link>
            ) : null}
            </div>
          </div>
        </TableCell>
        {!isStockList ? (
          <>
            <TableCell className="min-w-0 truncate text-muted-foreground" title={row.saleChannel?.name ?? undefined}>
              {row.saleChannel?.name ?? "—"}
            </TableCell>
            <TableCell className="min-w-0 truncate text-muted-foreground" title={locationName ?? undefined}>
              {locationName ?? "-"}
            </TableCell>
            <TableCell className="min-w-0 overflow-hidden whitespace-normal">
              {row.manufacturingOrders.length > 0 || row.warehouseOrders.length > 0 ? (
                <div className="flex min-w-0 flex-col gap-1">
                  {row.manufacturingOrders.map((mo) => (
                    <div key={mo.id} className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block min-w-0 truncate text-xs hover:underline"
                        title={`MO: ${mo.name}`}
                      >
                        MO: {mo.name}
                      </Link>
                      <Badge
                        variant="outline"
                        className={`w-fit max-w-full truncate ${statusBadgeClassName(mo.status)} text-[10px] font-medium`}
                        title={moStatusLabels[mo.status] ?? mo.status}
                      >
                        {moStatusLabels[mo.status] ?? mo.status}
                      </Badge>
                    </div>
                  ))}
                  {row.warehouseOrders.map((wo) => (
                    <div key={wo.id} className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        href={`/warehouse-orders/${wo.id}`}
                        className="block min-w-0 truncate text-xs hover:underline"
                        title={`WO: ${wo.name}`}
                      >
                        WO: {wo.name}
                      </Link>
                      <Badge
                        variant="outline"
                        className={`w-fit max-w-full truncate ${statusBadgeClassName(wo.status)} text-[10px] font-medium`}
                        title={warehouseOrderStatusLabels[wo.status] ?? wo.status}
                      >
                        {warehouseOrderStatusLabels[wo.status] ?? wo.status}
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
        {showTrackingNumbers ? (
          <TableCell className="min-w-0 whitespace-normal">
            {trackingNumbers.length > 0 ? (
              <div className="flex flex-col gap-1">
                {trackingNumbers.map((trackingNumber) => (
                  <span
                    key={trackingNumber}
                    className="break-all font-mono text-xs text-foreground"
                  >
                    {trackingNumber}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        ) : null}
        <TableCell className="min-w-0 whitespace-normal">
          <div className="flex min-w-0 flex-col gap-1.5">
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
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
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
          <TableCell
            colSpan={colSpan}
            className="max-w-0 w-full min-w-0 whitespace-normal border-t border-border/60 bg-muted/15 p-3 pt-2"
          >
            {isPending ? (
              <p className="text-sm text-muted-foreground">Loading line items…</p>
            ) : isError ? (
              <p className="text-sm text-destructive">Could not load line items.</p>
            ) : !lines?.length ? (
              <p className="text-sm text-muted-foreground">No line items.</p>
            ) : (
              <div className="min-w-0 max-w-full overflow-x-auto rounded-lg border border-border/60 bg-background p-3">
                <LineItemsGrid dense className="min-w-0 [&>*]:min-w-0">
                  {lines.map((line) => (
                    <LineItemCard
                      key={line.id}
                      compact
                      imageKey={line.product.imageKey}
                      title={line.product.name}
                      subtitle={lineItemSubtitle(line)}
                      onEditProduct={onEditProduct ? () => onEditProduct(line.product) : undefined}
                      viewOnly={viewOnly}
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
