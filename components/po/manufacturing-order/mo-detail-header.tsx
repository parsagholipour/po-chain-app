"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { OrderStatusLogsDialog } from "@/components/po/order-status-logs-dialog";
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
import type { ManufacturingOrderDetail } from "@/lib/types/api";
import {
  moStatusLabels,
  moStatuses,
  shippingStatusLabels,
  statusBadgeClassName,
} from "@/lib/po/status-labels";
import { storageObjectDisplayName } from "@/lib/storage/display-name";
import { PoDocumentLink } from "@/components/po/purchase-order/po-document-link";
import { Check, ChevronLeft, Factory, FileStack, Loader2, Pencil, Truck, X } from "lucide-react";
import { cn } from "@/lib/utils";

const moOrderStatusSelectItems = moStatuses.map((s) => ({
  value: s,
  label: moStatusLabels[s] ?? s,
}));

function moOrderStatusItemsForValue(currentStatus: string) {
  if ((moStatuses as readonly string[]).includes(currentStatus)) {
    return moOrderStatusSelectItems;
  }
  return [
    { value: currentStatus, label: moStatusLabels[currentStatus] ?? currentStatus },
    ...moOrderStatusSelectItems,
  ];
}

type Props = {
  mo: ManufacturingOrderDetail;
  statusLogs: ManufacturingOrderDetail["statusLogs"];
  onStatusChange: (status: string) => void;
  onSaveStatusLogNote?: (logId: string, note: string | null) => Promise<void>;
  onDocumentUpload?: (file: File) => Promise<void>;
  isSaving?: boolean;
  isDocumentSaving?: boolean;
  /** Deletes the MO (linked POs and their lines are kept). */
  onDelete?: () => Promise<void>;
  isDeleting?: boolean;
};

export function MoDetailHeader({
  mo,
  statusLogs,
  onStatusChange,
  onSaveStatusLogNote,
  onDocumentUpload,
  isSaving = false,
  isDocumentSaving = false,
  onDelete,
  isDeleting = false,
}: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isEditingDocument, setIsEditingDocument] = useState(false);
  const [pendingDocumentName, setPendingDocumentName] = useState<string | null>(null);
  const mfrCount = mo.manufacturers.length;
  const shipCount = mo.shippings.length;
  const lineAllocCount = mo.lineAllocations.length;
  const poCount = mo.purchaseOrders.length;
  const currentDocumentName = storageObjectDisplayName(mo.documentKey);
  const visibleDocumentName = pendingDocumentName ?? currentDocumentName;
  const isDocumentBusy = isSaving || isDocumentSaving || isDeleting;

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
          href="/manufacturing-orders"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 w-fit text-muted-foreground hover:text-foreground",
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Back to manufacturing orders
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-sm text-muted-foreground">MO #{mo.number}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{mo.name}</h1>
            <div
              className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-xs text-muted-foreground"
              aria-label="Manufacturing order summary"
            >
              <span className="inline-flex items-center gap-1.5">
                <FileStack className="size-3.5 shrink-0 opacity-70" aria-hidden />
                <span>
                  {lineAllocCount} line allocation{lineAllocCount === 1 ? "" : "s"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Factory className="size-3.5 shrink-0 opacity-70" aria-hidden />
                <span>
                  {mfrCount} manufacturer{mfrCount === 1 ? "" : "s"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Truck className="size-3.5 shrink-0 opacity-70" aria-hidden />
                <span>
                  {shipCount} shipment{shipCount === 1 ? "" : "s"}
                </span>
              </span>
              <span className="text-muted-foreground">
                {poCount} PO{poCount === 1 ? "" : "s"} linked
              </span>
            </div>
            {mo.shippings.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-2">
                {mo.shippings.map((shipping) => (
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
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <Label htmlFor="mo-status" className="text-xs text-muted-foreground">
              Manufacturing status
            </Label>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Select
                value={mo.status}
                items={moOrderStatusItemsForValue(mo.status)}
                disabled={isSaving}
                onValueChange={(v) => {
                  if (v) onStatusChange(v);
                }}
              >
                <SelectTrigger id="mo-status" className="w-full sm:w-[220px]" aria-busy={isSaving}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {moStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {moStatusLabels[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <OrderStatusLogsDialog
                title="Manufacturing order status history"
                description="Newest first. Each entry shows when the manufacturing order status changed and who changed it."
                logs={statusLogs}
                statusLabels={moStatusLabels}
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
                  Delete manufacturing order
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this manufacturing order?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes manufacturers, PO links, line allocations, and shipments that
                      belong only to this MO. Linked purchase orders are not deleted.
                      Invoices attached to manufacturers on this MO will be removed.
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
        <div className="min-w-0 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Document:</span>
            <PoDocumentLink documentKey={mo.documentKey} />
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
                <Label htmlFor="mo-document" className="text-xs text-muted-foreground">
                  Choose a new file
                </Label>
                <Input
                  id="mo-document"
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
      </CardContent>
    </Card>
  );
}
