"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { PurchaseOrderDetail, SaleChannel } from "@/lib/types/api";
import { saleChannelTypeLabels } from "@/lib/po/sale-channel-labels";
import {
  distributorPoStatusLabels,
  distributorPoStatuses,
} from "@/lib/po/status-labels";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import { PoDocumentLink } from "./po-document-link";
import { ChevronLeft, FileStack, Factory } from "lucide-react";
import { cn } from "@/lib/utils";

const poOrderStatusSelectItems = distributorPoStatuses.map((s) => ({
  value: s,
  label: distributorPoStatusLabels[s] ?? s,
}));

function poOrderStatusItemsForValue(currentStatus: string) {
  if ((distributorPoStatuses as readonly string[]).includes(currentStatus)) {
    return poOrderStatusSelectItems;
  }
  return [
    {
      value: currentStatus,
      label: distributorPoStatusLabels[currentStatus] ?? currentStatus,
    },
    ...poOrderStatusSelectItems,
  ];
}

type Props = {
  po: PurchaseOrderDetail;
  onStatusChange: (status: string) => void;
  /** Distributor PO only — omit for stock orders */
  saleChannelOptions?: SaleChannel[];
  onSaleChannelChange?: (saleChannelId: string) => void;
  isSaving?: boolean;
  onDelete?: () => Promise<void>;
  isDeleting?: boolean;
};

export function PoDetailHeader({
  po,
  saleChannelOptions = [],
  onSaleChannelChange,
  onStatusChange,
  isSaving = false,
  onDelete,
  isDeleting = false,
}: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isStock = po.type === "stock";
  const listHref = isStock ? "/stock-orders" : "/purchase-orders-overview";
  const backLabel = isStock ? "Back to stock orders" : "Back to purchase orders";
  const orderMonoLabel = isStock ? "Stock order" : "PO";
  const statusFieldLabel = isStock ? "Order status" : "PO status";
  const statusId = isStock ? "stock-order-status" : "po-status";
  const summaryAria = isStock ? "Stock order summary" : "Purchase order summary";

  const saleChannelItems = useMemo(() => {
    if (isStock || !po.saleChannel) return [];
    const fromOptions = saleChannelOptions.map((sc) => ({
      value: sc.id,
      label: `${sc.name} (${saleChannelTypeLabels[sc.type] ?? sc.type})`,
    }));
    if (fromOptions.some((r) => r.value === po.saleChannel!.id)) {
      return fromOptions;
    }
    return [
      {
        value: po.saleChannel.id,
        label: `${po.saleChannel.name} (${saleChannelTypeLabels[po.saleChannel.type as SaleChannel["type"]] ?? po.saleChannel.type})`,
      },
      ...fromOptions,
    ];
  }, [isStock, saleChannelOptions, po.saleChannel]);

  const lineCount = po.lines.length;
  const moCount = po.manufacturingOrderPurchaseOrders.length;
  const showSaleChannel = !isStock && po.saleChannel != null && onSaleChannelChange != null;

  return (
    <Card className="border-border/80 shadow-sm ring-border/40">
      <CardHeader className="gap-4 border-b border-border/60 pb-4">
        <Link
          href={listHref}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 w-fit text-muted-foreground hover:text-foreground",
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-sm text-muted-foreground">
              {orderMonoLabel} #{po.number}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{po.name}</h1>
            <div
              className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-xs text-muted-foreground"
              aria-label={summaryAria}
            >
              <span className="inline-flex items-center gap-1.5">
                <FileStack className="size-3.5 shrink-0 opacity-70" aria-hidden />
                <span>
                  {lineCount} line {lineCount === 1 ? "item" : "items"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Factory className="size-3.5 shrink-0 opacity-70" aria-hidden />
                <span>
                  {moCount} manufacturing order{moCount === 1 ? "" : "s"}
                </span>
              </span>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <Label htmlFor={statusId} className="text-xs text-muted-foreground">
              {statusFieldLabel}
            </Label>
            <Select
              value={po.status}
              items={poOrderStatusItemsForValue(po.status)}
              disabled={isSaving}
              onValueChange={(v) => {
                if (v) onStatusChange(v);
              }}
            >
              <SelectTrigger id={statusId} className="w-full sm:w-[220px]" aria-busy={isSaving}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {distributorPoStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {distributorPoStatusLabels[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {onDelete ? (
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogTrigger
                  nativeButton
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto"
                      disabled={isDeleting}
                    />
                  }
                >
                  Delete {isStock ? "stock order" : "purchase order"}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete this {isStock ? "stock order" : "purchase order"}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the {isStock ? "stock order" : "PO"} and all its line
                      items. Links from manufacturing orders and MO line allocations for those lines
                      are removed. Manufacturing orders themselves are kept.
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
                          await onDelete();
                          setDeleteOpen(false);
                        } catch {
                          /* mutation shows toast */
                        }
                      }}
                    >
                      {isDeleting ? "Deleting…" : "Delete"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex flex-col gap-4 text-sm sm:flex-row sm:flex-wrap sm:items-start sm:gap-8">
          <div className="min-w-0">
            <span className="text-muted-foreground">Document: </span>
            <PoDocumentLink documentKey={po.documentKey} />
          </div>
          {showSaleChannel ? (
            <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <Label htmlFor="po-sale-channel" className="text-muted-foreground sm:shrink-0">
                Sale channel
              </Label>
              <div className="flex min-w-0 items-center gap-2">
                <StorageObjectImage
                  reference={po.saleChannel.logoKey}
                  className="size-8 shrink-0"
                  objectFit="cover"
                />
                <Select
                  value={po.saleChannel.id}
                  items={saleChannelItems}
                  disabled={isSaving}
                  onValueChange={(v) => {
                    if (v) onSaleChannelChange!(v);
                  }}
                >
                  <SelectTrigger
                    id="po-sale-channel"
                    className="w-[min(100%,280px)] sm:w-[260px]"
                    aria-busy={isSaving}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {saleChannelOptions.map((sc) => (
                      <SelectItem key={sc.id} value={sc.id}>
                        {`${sc.name} (${saleChannelTypeLabels[sc.type] ?? sc.type})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
