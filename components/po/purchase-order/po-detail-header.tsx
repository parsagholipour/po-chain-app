"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
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
import { Input } from "@/components/ui/input";
import type { PurchaseOrderDetail, SaleChannel } from "@/lib/types/api";
import { saleChannelTypeLabels } from "@/lib/po/sale-channel-labels";
import {
  distributorPoStatusLabels,
  distributorPoStatuses,
  shippingStatusLabels,
} from "@/lib/po/status-labels";
import { Badge } from "@/components/ui/badge";
import { storageObjectDisplayName } from "@/lib/storage/display-name";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import { OrderStatusLogsDialog } from "@/components/po/order-status-logs-dialog";
import { PoDocumentLink } from "./po-document-link";
import { Check, ChevronLeft, FileStack, Factory, Loader2, Pencil, X } from "lucide-react";
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
  statusLogs: PurchaseOrderDetail["statusLogs"];
  onStatusChange: (status: string) => void;
  onSaveStatusLogNote?: (logId: string, note: string | null) => Promise<void>;
  /** Distributor PO only — omit for stock orders */
  saleChannelOptions?: SaleChannel[];
  onSaleChannelChange?: (saleChannelId: string) => void;
  onDocumentUpload?: (file: File) => Promise<void>;
  isSaving?: boolean;
  isDocumentSaving?: boolean;
  onDelete?: () => Promise<void>;
  isDeleting?: boolean;
};

export function PoDetailHeader({
  po,
  statusLogs,
  saleChannelOptions = [],
  onSaleChannelChange,
  onDocumentUpload,
  onStatusChange,
  onSaveStatusLogNote,
  isSaving = false,
  isDocumentSaving = false,
  onDelete,
  isDeleting = false,
}: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isEditingDocument, setIsEditingDocument] = useState(false);
  const [pendingDocumentName, setPendingDocumentName] = useState<string | null>(null);
  const isStock = po.type === "stock";
  const listHref = isStock ? "/stock-orders" : "/purchase-orders-overview";
  const backLabel = isStock ? "Back to stock orders" : "Back to purchase orders";
  const orderMonoLabel = isStock ? "Stock order" : "PO";
  const statusFieldLabel = isStock ? "Order status" : "PO status";
  const statusDialogTitle = isStock ? "Stock order status history" : "Purchase order status history";
  const statusDialogDescription = isStock
    ? "Newest first. Each entry shows when the stock order status changed and who changed it."
    : "Newest first. Each entry shows when the purchase order status changed and who changed it.";
  const statusId = isStock ? "stock-order-status" : "po-status";
  const summaryAria = isStock ? "Stock order summary" : "Purchase order summary";

  const saleChannelItems = useMemo(() => {
    if (!po.saleChannel) return [];
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
  }, [saleChannelOptions, po.saleChannel]);

  const lineCount = po.lines.length;
  const moCount = po.manufacturingOrderPurchaseOrders.length;
  const showSaleChannel = po.saleChannel != null && onSaleChannelChange != null;
  const documentInputId = isStock ? "stock-order-document" : "po-document";
  const currentDocumentName = storageObjectDisplayName(po.documentKey);
  const visibleDocumentName = pendingDocumentName ?? currentDocumentName;
  const isDocumentBusy = isSaving || isDocumentSaving || isDeleting;
  const shipCount = po.shippings.length;

  function handleDocumentChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    if (!file || !onDocumentUpload) return;
    setPendingDocumentName(file.name);
    void onDocumentUpload(file)
      .then(() => {
        setPendingDocumentName(null);
        setIsEditingDocument(false);
      })
      .catch(() => undefined)
      .finally(() => {
        input.value = "";
      });
  }

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
              <span className="inline-flex items-center gap-1.5">
                <span>
                  {shipCount} shipment{shipCount === 1 ? "" : "s"}
                </span>
              </span>
            </div>
            {po.shippings.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="text-xs font-medium text-foreground">Shipping</span>
                {po.shippings.map((shipping) => (
                  <Badge key={shipping.id} variant="outline" className="text-xs font-medium">
                    {shippingStatusLabels[shipping.status] ?? shipping.status}
                    {" · "}
                    {shipping.trackingNumber}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <Label htmlFor={statusId} className="text-xs text-muted-foreground">
              {statusFieldLabel}
            </Label>
            <div className="flex w-full items-center gap-2 sm:w-auto">
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
              <OrderStatusLogsDialog
                title={statusDialogTitle}
                description={statusDialogDescription}
                logs={statusLogs}
                statusLabels={distributorPoStatusLabels}
                onSaveNote={onSaveStatusLogNote}
              />
            </div>
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
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Document:</span>
              <PoDocumentLink documentKey={po.documentKey} />
              {visibleDocumentName ? (
                <span className="break-all text-xs text-muted-foreground">{visibleDocumentName}</span>
              ) : null}
              {onDocumentUpload ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  disabled={isDocumentBusy}
                  aria-label={isEditingDocument ? "Close document editor" : "Edit document"}
                  onClick={() => setIsEditingDocument((prev) => !prev)}
                >
                  {isDocumentSaving ? <Loader2 className="size-3 animate-spin" /> : <Pencil className="size-3" />}
                </Button>
              ) : null}
            </div>
            {onDocumentUpload && isEditingDocument ? (
              <div className="flex max-w-sm flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/30 p-2">
                <div className="min-w-0 flex-1">
                  <Label htmlFor={documentInputId} className="text-xs text-muted-foreground">
                    Choose a new file
                  </Label>
                  <Input
                    id={documentInputId}
                    type="file"
                    disabled={isDocumentBusy}
                    className="mt-1"
                    onChange={handleDocumentChange}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={isDocumentBusy}
                  aria-label="Close document editor"
                  onClick={() => setIsEditingDocument(false)}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ) : null}
            {isDocumentSaving ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Uploading{pendingDocumentName ? ` ${pendingDocumentName}` : ""}…
              </p>
            ) : null}
            {!isDocumentSaving && pendingDocumentName ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="size-3.5" />
                {pendingDocumentName}
              </p>
            ) : null}
          </div>
          {showSaleChannel ? (
            <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <Label htmlFor="po-sale-channel" className="text-muted-foreground sm:shrink-0">
                Sale channel
              </Label>
              <div className="flex min-w-0 items-center gap-2">
                <StorageObjectImage
                  reference={po.saleChannel!.logoKey}
                  className="size-8 shrink-0"
                  objectFit="cover"
                />
                <Select
                  value={po.saleChannel!.id}
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
