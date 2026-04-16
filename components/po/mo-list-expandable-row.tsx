"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/axios";
import { LineItemCard, LineItemsGrid } from "@/components/po/line-items/line-items-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import type {
  ManufacturingOrderDetail,
  ManufacturingOrderSummary,
  ManufacturingOrderSummaryLinkedOrder,
  Product,
} from "@/lib/types/api";
import { MoLinkedOrderLabel } from "@/components/po/mo-linked-order-label";
import { moStatusLabels, shippingStatusLabels } from "@/lib/po/status-labels";
import { ChevronDown, ChevronRight } from "lucide-react";

function linkedOrderHref(type: "distributor" | "stock", id: string) {
  return type === "stock" ? `/stock-orders/${id}` : `/purchase-orders/${id}`;
}

const LINKED_ORDER_PREVIEW_MAX = 4;

function MoLinkedOrdersChips({ orders }: { orders: ManufacturingOrderSummaryLinkedOrder[] }) {
  if (orders.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const visible = orders.slice(0, LINKED_ORDER_PREVIEW_MAX);
  const overflow = orders.slice(LINKED_ORDER_PREVIEW_MAX);
  const overflowTitle =
    overflow.length > 0
      ? overflow
          .map((o) => {
            const kind = o.type === "stock" ? "SO" : "PO";
            const ch = o.saleChannelName ? ` · ${o.saleChannelName}` : "";
            return `${kind} ${o.name}${ch}`;
          })
          .join("\n")
      : undefined;

  return (
    <div className="flex max-w-[min(100%,22rem)] flex-col gap-1">
      {visible.map((o) => {
        const title = [o.name, o.saleChannelName].filter(Boolean).join(" · ");
        return (
          <Link
            key={o.id}
            href={linkedOrderHref(o.type, o.id)}
            title={title}
            className="flex min-h-6 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-muted/10 px-2 py-0.5 text-start text-xs transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => e.stopPropagation()}
          >
            <MoLinkedOrderLabel
              type={o.type}
              name={o.name}
              saleChannelName={o.saleChannelName}
              className="text-xs"
            />
          </Link>
        );
      })}
      {overflow.length > 0 ? (
        <span
          className="inline-flex w-fit items-center rounded-md border border-dashed border-border/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          title={overflowTitle}
        >
          +{overflow.length} more
        </span>
      ) : null}
    </div>
  );
}

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
        <TableCell>
          <Link href={href} className="font-medium hover:underline">
            {row.name}
          </Link>
        </TableCell>
        <TableCell className="align-top">
          <MoLinkedOrdersChips orders={row.linkedOrders ?? []} />
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
                            <MoLinkedOrderLabel
                              type={po.type}
                              name={po.name}
                              saleChannelName={po.saleChannel?.name ?? null}
                              className="text-[10px] text-muted-foreground"
                              badgeClassName="text-[8px]"
                            />
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
