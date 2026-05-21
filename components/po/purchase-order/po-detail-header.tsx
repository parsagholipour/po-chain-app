"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
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
import type { PurchaseOrderDetail, SaleChannel, SaleChannelLocation } from "@/lib/types/api";
import { saleChannelTypeLabels } from "@/lib/po/sale-channel-labels";
import {
  distributorPoStatusLabels,
  distributorPoStatuses,
  shippingStatusLabels,
  statusBadgeClassName,
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
const NO_LOCATION_ID = "none";

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
  onNameChange?: (name: string) => Promise<void> | void;
  onStatusChange?: (status: string) => void;
  onSaveStatusLogNote?: (logId: string, note: string | null) => Promise<void>;
  /** Distributor PO only — omit for stock orders */
  saleChannelOptions?: SaleChannel[];
  onSaleChannelChange?: (saleChannelId: string) => void;
  saleChannelLocations?: SaleChannelLocation[];
  saleChannelLocationsPending?: boolean;
  onLocationChange?: (locationId: string | null) => void;
  onDocumentUpload?: (file: File) => Promise<void>;
  isSaving?: boolean;
  isDocumentSaving?: boolean;
  onActualize?: () => Promise<void>;
  isActualizing?: boolean;
  onDelete?: () => Promise<void>;
  isDeleting?: boolean;
};

export function PoDetailHeader({
  po,
  statusLogs,
  onNameChange,
  saleChannelOptions = [],
  onSaleChannelChange,
  saleChannelLocations = [],
  saleChannelLocationsPending = false,
  onLocationChange,
  onDocumentUpload,
  onStatusChange,
  onSaveStatusLogNote,
  isSaving = false,
  isDocumentSaving = false,
  onActualize,
  isActualizing = false,
  onDelete,
  isDeleting = false,
}: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(po.name);
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
  const locationDisplayName = po.saleChannelLocation?.name ?? po.shipToLocationName ?? null;
  const hasSnapshotOnlyLocation = !po.saleChannelLocationId && po.shipToLocationName != null;
  const showLocation = po.saleChannel != null && onLocationChange != null && !hasSnapshotOnlyLocation;
  const documentInputId = isStock ? "stock-order-document" : "po-document";
  const nameInputId = isStock ? "stock-order-name" : "po-name";
  const currentDocumentName = storageObjectDisplayName(po.documentKey);
  const visibleDocumentName = pendingDocumentName ?? currentDocumentName;
  const isDocumentBusy = isSaving || isDocumentSaving || isDeleting;
  const shipCount = po.shippings.length;
  const canEditStatus = onStatusChange != null;
  const canEditName = onNameChange != null;
  const canActualize = po.isBackOrder && !po.actualizedPoId && onActualize != null;
  const locationItems = useMemo(
    () => [
      { value: NO_LOCATION_ID, label: "No location" },
      ...saleChannelLocations.map((location) => ({
        value: location.id,
        label: location.name,
      })),
    ],
    [saleChannelLocations],
  );

  function startEditingName() {
    setDraftName(po.name);
    setIsEditingName(true);
  }

  function cancelEditingName() {
    setDraftName(po.name);
    setIsEditingName(false);
  }

  async function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onNameChange) return;
    const nextName = draftName.trim();
    if (!nextName) return;
    if (nextName === po.name) {
      setIsEditingName(false);
      return;
    }
    await onNameChange(nextName);
    setIsEditingName(false);
  }

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
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-sm text-muted-foreground">
              {orderMonoLabel} #{po.number}
            </p>
            <div className="flex min-w-0 flex-wrap items-start gap-2">
              {canEditName && isEditingName ? (
                <form
                  className="flex min-w-0 max-w-full flex-1 flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    void handleNameSubmit(event).catch(() => undefined);
                  }}
                >
                  <Label htmlFor={nameInputId} className="sr-only">
                    {isStock ? "Stock order name" : "PO name"}
                  </Label>
                  <Input
                    id={nameInputId}
                    value={draftName}
                    autoFocus
                    required
                    disabled={isSaving || isDeleting}
                    className="h-9 min-w-0 flex-1 text-lg font-semibold sm:min-w-[260px] sm:max-w-lg"
                    aria-busy={isSaving}
                    onChange={(event) => setDraftName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelEditingName();
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    variant="default"
                    size="icon-sm"
                    disabled={isSaving || isDeleting || draftName.trim().length === 0}
                    aria-label="Save PO name"
                  >
                    {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={isSaving || isDeleting}
                    aria-label="Cancel PO name edit"
                    onClick={cancelEditingName}
                  >
                    <X className="size-3.5" />
                  </Button>
                </form>
              ) : (
                <>
                  {canEditName ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="mt-0.5 text-muted-foreground"
                      disabled={isSaving || isDeleting}
                      aria-label="Edit PO name"
                      onClick={startEditingName}
                    >
                      <Pencil className="size-3" />
                    </Button>
                  ) : null}
                  <h1 className="min-w-0 max-w-full break-words text-2xl font-semibold leading-tight tracking-tight">
                    {po.name}
                  </h1>
                </>
              )}
              {po.isBackOrder ? (
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                >
                  Back Order
                </Badge>
              ) : null}
            </div>
            {po.actualizedPo ? (
              <Link
                href={`/purchase-orders/${po.actualizedPo.id}`}
                className="inline-flex w-fit text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Actualized as PO #{po.actualizedPo.number}
              </Link>
            ) : null}
            <div
              className="grid gap-2 pt-2 text-xs text-muted-foreground sm:flex sm:flex-wrap sm:gap-x-4 sm:gap-y-2"
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
                  <Badge
                    key={shipping.id}
                    variant="outline"
                    className={`${statusBadgeClassName(shipping.status)} text-xs font-medium`}
                  >
                    {shippingStatusLabels[shipping.status] ?? shipping.status}
                    {" · "}
                    {shipping.trackingNumber}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-[260px] lg:items-end">
            <Label htmlFor={statusId} className="text-xs text-muted-foreground">
              {statusFieldLabel}
            </Label>
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 lg:w-auto">
              {canEditStatus ? (
                <Select
                  value={po.status}
                  items={poOrderStatusItemsForValue(po.status)}
                  disabled={isSaving}
                  onValueChange={(v) => {
                    if (v) onStatusChange(v);
                  }}
                >
                  <SelectTrigger id={statusId} className="w-full lg:w-[220px]" aria-busy={isSaving}>
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
              ) : (
                <Badge
                  id={statusId}
                  variant="secondary"
                  className={`${statusBadgeClassName(po.status)} min-h-9 max-w-full justify-start truncate px-3 text-sm font-medium`}
                >
                  {distributorPoStatusLabels[po.status] ?? po.status}
                </Badge>
              )}
              <OrderStatusLogsDialog
                title={statusDialogTitle}
                description={statusDialogDescription}
                logs={statusLogs}
                statusLabels={distributorPoStatusLabels}
                onSaveNote={onSaveStatusLogNote}
              />
            </div>
            {canActualize ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto"
                disabled={isActualizing}
                onClick={() => {
                  void onActualize();
                }}
              >
                {isActualizing ? "Actualizing..." : "Actualize Back Order"}
              </Button>
            ) : null}
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
          {po.saleChannel && locationDisplayName && (!showLocation || hasSnapshotOnlyLocation) ? (
            <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-muted-foreground sm:shrink-0">Location</span>
              <Badge variant="secondary" className="w-fit max-w-[280px] truncate">
                {locationDisplayName}
              </Badge>
            </div>
          ) : null}
          {showLocation ? (
            <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <Label htmlFor="po-sale-channel-location" className="text-muted-foreground sm:shrink-0">
                Location
              </Label>
              <Select
                value={po.saleChannelLocationId ?? NO_LOCATION_ID}
                items={locationItems}
                disabled={isSaving || saleChannelLocationsPending}
                onValueChange={(v) => {
                  onLocationChange(v === NO_LOCATION_ID ? null : v);
                }}
              >
                <SelectTrigger
                  id="po-sale-channel-location"
                  className="w-[min(100%,280px)] sm:w-[260px]"
                  aria-busy={isSaving || saleChannelLocationsPending}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LOCATION_ID}>No location</SelectItem>
                  {saleChannelLocations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
