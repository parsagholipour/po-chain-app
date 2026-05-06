"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ChevronLeft, Loader2, Package, Plus, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { invalidateNavCounts } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";
import type {
  OrderStatusLog,
  PoLineRow,
  PurchaseOrderSummary,
  Warehouse,
  WarehouseOrderDetail,
} from "@/lib/types/api";
import {
  shippingStatusLabels,
  statusBadgeClassName,
  warehouseOrderStatusLabels,
  warehouseOrderStatuses,
} from "@/lib/po/status-labels";
import { useConfirm } from "@/components/confirm-provider";
import { OrderStatusLogsDialog } from "@/components/po/order-status-logs-dialog";
import { PoDocumentLink } from "@/components/po/purchase-order/po-document-link";
import { PoShipmentsSection } from "@/components/po/purchase-order/po-shipments-section";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AddLineDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wo: WarehouseOrderDetail;
  onSubmit: (values: { purchaseOrderLineId: string; quantity: number }) => Promise<void>;
};

function lineRemaining(line: PoLineRow) {
  const moQuantity = line.allocations.reduce((sum, row) => sum + row.quantity, 0);
  const woQuantity = line.warehouseAllocations.reduce((sum, row) => sum + row.quantity, 0);
  return Math.max(0, line.quantity - moQuantity - woQuantity);
}

function AddWarehouseOrderLineDialog({ open, onOpenChange, wo, onSubmit }: AddLineDialogProps) {
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [lineId, setLineId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const linkedPoIds = useMemo(
    () => wo.purchaseOrders.map((row) => row.purchaseOrder.id),
    [wo.purchaseOrders],
  );
  const allocatedLineIds = useMemo(
    () => new Set(wo.lineAllocations.map((row) => row.purchaseOrderLineId)),
    [wo.lineAllocations],
  );

  const { data: lines = [], isFetching } = useQuery({
    queryKey: ["warehouse-order-add-line", purchaseOrderId],
    queryFn: async () => {
      const { data } = await api.get<PoLineRow[]>(`/api/purchase-orders/${purchaseOrderId}/lines`);
      return data;
    },
    enabled: open && !!purchaseOrderId,
  });

  const lineOptions = useMemo(
    () =>
      lines
        .filter((line) => !allocatedLineIds.has(line.id))
        .map((line) => ({
          line,
          remaining: lineRemaining(line),
        }))
        .filter((row) => row.remaining > 0),
    [lines, allocatedLineIds],
  );

  const selectedLine = lineOptions.find((row) => row.line.id === lineId);
  const maxQuantity = selectedLine?.remaining ?? 1;

  useEffect(() => {
    if (!open) {
      setPurchaseOrderId("");
      setLineId("");
      setQuantity(1);
    }
  }, [open]);

  useEffect(() => {
    setLineId("");
    setQuantity(1);
  }, [purchaseOrderId]);

  useEffect(() => {
    setQuantity((current) => Math.max(1, Math.min(maxQuantity, current)));
  }, [maxQuantity]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add warehouse order line</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!lineId || quantity <= 0) return;
            setSubmitting(true);
            try {
              await onSubmit({ purchaseOrderLineId: lineId, quantity });
              onOpenChange(false);
            } catch {
              // parent mutation toasts
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="space-y-2">
            <Label required>Purchase order</Label>
            <Select
              value={purchaseOrderId}
              items={wo.purchaseOrders.map((row) => ({
                value: row.purchaseOrder.id,
                label: row.purchaseOrder.name,
              }))}
              disabled={submitting || linkedPoIds.length === 0}
              onValueChange={(v) => {
                if (v) setPurchaseOrderId(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select linked PO" />
              </SelectTrigger>
              <SelectContent>
                {wo.purchaseOrders.map((row) => (
                  <SelectItem key={row.purchaseOrder.id} value={row.purchaseOrder.id}>
                    {row.purchaseOrder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label required>Line</Label>
            <Select
              value={lineId}
              items={lineOptions.map((row) => ({
                value: row.line.id,
                label: `${row.line.product.name} (${row.remaining} available)`,
              }))}
              disabled={submitting || !purchaseOrderId || isFetching}
              onValueChange={(v) => {
                if (v) setLineId(v);
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !purchaseOrderId
                      ? "Select PO first"
                      : isFetching
                        ? "Loading lines..."
                        : "Select line"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {lineOptions.map((row) => (
                  <SelectItem key={row.line.id} value={row.line.id}>
                    {row.line.product.name} - {row.remaining} available
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wo-line-qty" required>
              Quantity
            </Label>
            <Input
              id="wo-line-qty"
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              disabled={submitting || !lineId}
              onChange={(event) => {
                setQuantity(Math.max(1, Math.min(maxQuantity, Number(event.target.value) || 1)));
              }}
            />
          </div>

          <DialogFooter className="border-0 bg-transparent">
            <Button type="submit" disabled={submitting || !lineId || quantity <= 0}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Add line"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WarehouseOrderSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading warehouse order">
      <Card className="border-border/80">
        <CardHeader className="gap-3 border-b border-border/60 pb-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full max-w-md" />
        </CardHeader>
      </Card>
      <Skeleton className="h-44 rounded-xl" />
    </div>
  );
}

export function WarehouseOrderDetailView({ warehouseOrderId }: { warehouseOrderId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const woKey = ["warehouse-order", warehouseOrderId] as const;

  const {
    data: wo,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: woKey,
    queryFn: async () => {
      const { data } = await api.get<WarehouseOrderDetail>(
        `/api/warehouse-orders/${warehouseOrderId}`,
      );
      return data;
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await api.get<Warehouse[]>("/api/warehouses");
      return data;
    },
  });

  const { data: openPurchaseOrders = [] } = useQuery({
    queryKey: ["purchase-orders", "warehouse-order-link"],
    queryFn: async () => {
      const { data } = await api.get<PurchaseOrderSummary[]>("/api/purchase-orders", {
        params: { status: "open" },
      });
      return data;
    },
  });

  const nameInputRef = useRef<HTMLInputElement>(null);
  const [linkPoId, setLinkPoId] = useState("");
  const [addLineOpen, setAddLineOpen] = useState(false);

  function setWoData(row: WarehouseOrderDetail) {
    qc.setQueryData(woKey, row);
    qc.invalidateQueries({ queryKey: ["warehouse-orders"] });
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
  }

  const patchWo = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch<WarehouseOrderDetail>(
        `/api/warehouse-orders/${warehouseOrderId}`,
        body,
      );
      return data;
    },
    onSuccess: async (row) => {
      setWoData(row);
      await invalidateNavCounts(qc);
      toast.success("Updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteWo = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/warehouse-orders/${warehouseOrderId}`);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["warehouse-orders"] }),
        qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
        qc.invalidateQueries({ queryKey: ["shipping"] }),
        invalidateNavCounts(qc),
      ]);
      qc.removeQueries({ queryKey: woKey });
      toast.success("Warehouse order deleted");
      router.push("/warehouse-orders");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const saveStatusLogNote = useMutation({
    mutationFn: async ({ logId, note }: { logId: string; note: string | null }) => {
      const { data } = await api.patch<OrderStatusLog>(`/api/order-status-logs/${logId}`, {
        note,
      });
      return data;
    },
    onSuccess: (updatedLog) => {
      qc.setQueryData<WarehouseOrderDetail | undefined>(woKey, (current) =>
        current
          ? {
              ...current,
              statusLogs: current.statusLogs.map((log) =>
                log.id === updatedLog.id ? updatedLog : log,
              ),
            }
          : current,
      );
      toast.success("Note saved");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const linkPo = useMutation({
    mutationFn: async (purchaseOrderId: string) => {
      const { data } = await api.post<WarehouseOrderDetail>(
        `/api/warehouse-orders/${warehouseOrderId}/purchase-orders`,
        { purchaseOrderId },
      );
      return data;
    },
    onSuccess: (row) => {
      setWoData(row);
      setLinkPoId("");
      toast.success("Purchase order linked");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const unlinkPo = useMutation({
    mutationFn: async (purchaseOrderId: string) => {
      const { data } = await api.delete<WarehouseOrderDetail>(
        `/api/warehouse-orders/${warehouseOrderId}/purchase-orders/${purchaseOrderId}`,
      );
      return data;
    },
    onSuccess: (row) => {
      setWoData(row);
      toast.success("Purchase order removed");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const addLine = useMutation({
    mutationFn: async (body: { purchaseOrderLineId: string; quantity: number }) => {
      const { data } = await api.post<WarehouseOrderDetail>(
        `/api/warehouse-orders/${warehouseOrderId}/lines`,
        body,
      );
      return data;
    },
    onSuccess: (row) => {
      setWoData(row);
      toast.success("Line added");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const patchLine = useMutation({
    mutationFn: async ({
      purchaseOrderLineId,
      quantity,
    }: {
      purchaseOrderLineId: string;
      quantity: number;
    }) => {
      const { data } = await api.patch<WarehouseOrderDetail>(
        `/api/warehouse-orders/${warehouseOrderId}/lines/${purchaseOrderLineId}`,
        { quantity },
      );
      return data;
    },
    onSuccess: (row) => {
      setWoData(row);
      toast.success("Line updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteLine = useMutation({
    mutationFn: async (purchaseOrderLineId: string) => {
      const { data } = await api.delete<WarehouseOrderDetail>(
        `/api/warehouse-orders/${warehouseOrderId}/lines/${purchaseOrderLineId}`,
      );
      return data;
    },
    onSuccess: (row) => {
      setWoData(row);
      toast.success("Line removed");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  if (isPending) return <WarehouseOrderSkeleton />;

  if (isError) {
    const notFound = axios.isAxiosError(error) && error.response?.status === 404;
    return (
      <div className="mx-auto max-w-lg py-6 sm:py-10">
        <Card className="border-border/80 text-center shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">
              {notFound ? "Warehouse order not found" : "Could not load this warehouse order"}
            </CardTitle>
            <CardDescription className="text-pretty">
              {notFound ? "It may have been removed, or the link is incorrect." : apiErrorMessage(error)}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-wrap justify-center gap-2 border-t bg-transparent">
            {!notFound ? (
              <Button type="button" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? "Retrying..." : "Try again"}
              </Button>
            ) : null}
            <Link href="/warehouse-orders" className={cn(buttonVariants({ variant: "outline" }))}>
              Back to list
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!wo) return null;

  const linkedPoIds = new Set(wo.purchaseOrders.map((row) => row.purchaseOrder.id));
  const linkablePurchaseOrders = openPurchaseOrders.filter((po) => !linkedPoIds.has(po.id));
  const isOpen = wo.status === "open";
  const linesBusy = addLine.isPending || patchLine.isPending || deleteLine.isPending;
  const linksSummary =
    wo.purchaseOrders.length === 0
      ? "No purchase orders linked"
      : `${wo.purchaseOrders.length} purchase order${wo.purchaseOrders.length === 1 ? "" : "s"}`;
  const linesSummary =
    wo.lineAllocations.length === 0
      ? "No lines allocated"
      : `${wo.lineAllocations.length} line${wo.lineAllocations.length === 1 ? "" : "s"}`;
  const shipmentsSummary =
    wo.shippings.length === 0
      ? "No shipments"
      : `${wo.shippings.length} shipment${wo.shippings.length === 1 ? "" : "s"}`;

  return (
    <div className="space-y-6">
      <Card className="border-border/80 shadow-sm ring-border/40">
        <CardHeader className="gap-4 border-b border-border/60 pb-4">
          <Link
            href="/warehouse-orders"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "-ml-2 w-fit text-muted-foreground hover:text-foreground",
            )}
          >
            <ChevronLeft className="size-4" aria-hidden />
            Back to warehouse orders
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex max-w-xl flex-wrap items-center gap-2">
                <Input
                  key={`${wo.id}-${wo.name}`}
                  ref={nameInputRef}
                  defaultValue={wo.name}
                  className="h-10 min-w-[16rem] text-lg font-semibold"
                  disabled={patchWo.isPending}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={patchWo.isPending}
                  onClick={() => {
                    const name = nameInputRef.current?.value.trim() ?? "";
                    if (!name || name === wo.name) return;
                    patchWo.mutate({ name });
                  }}
                >
                  Save name
                </Button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <WarehouseIcon className="size-3.5" aria-hidden />
                  {wo.warehouse.name}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Package className="size-3.5" aria-hidden />
                  {wo.lineAllocations.length} line{wo.lineAllocations.length === 1 ? "" : "s"}
                </span>
              </div>
              {wo.shippings.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {wo.shippings.map((shipping) => (
                    <Badge
                      key={shipping.id}
                      variant="outline"
                      className={`${statusBadgeClassName(shipping.status)} text-xs font-medium`}
                    >
                      {shippingStatusLabels[shipping.status] ?? shipping.status}
                      {shipping.trackingNumber ? ` - ${shipping.trackingNumber}` : ""}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Select
                  value={wo.status}
                  items={warehouseOrderStatuses.map((status) => ({
                    value: status,
                    label: warehouseOrderStatusLabels[status],
                  }))}
                  disabled={patchWo.isPending}
                  onValueChange={(value) => {
                    if (value) patchWo.mutate({ status: value });
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouseOrderStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {warehouseOrderStatusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <OrderStatusLogsDialog
                  title="Warehouse order status history"
                  description="Newest first. Each entry shows when the warehouse order status changed and who changed it."
                  logs={wo.statusLogs}
                  statusLabels={warehouseOrderStatusLabels}
                  onSaveNote={async (logId, note) => {
                    await saveStatusLogNote.mutateAsync({ logId, note });
                  }}
                />
              </div>
              <Select
                value={wo.warehouseId}
                items={warehouses.map((warehouse) => ({
                  value: warehouse.id,
                  label: warehouse.name,
                }))}
                disabled={patchWo.isPending}
                onValueChange={(value) => {
                  if (value && value !== wo.warehouseId) patchWo.mutate({ warehouseId: value });
                }}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto"
                disabled={deleteWo.isPending}
                onClick={() => {
                  void (async () => {
                    const ok = await confirm({
                      title: "Delete this warehouse order?",
                      description: "Linked purchase orders are kept. WO line allocations and WO-only shipments are removed.",
                      confirmLabel: "Delete",
                      variant: "destructive",
                    });
                    if (ok) deleteWo.mutate();
                  })();
                }}
              >
                Delete warehouse order
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Document: </span>
            <PoDocumentLink documentKey={wo.documentKey} />
          </div>
        </CardContent>
      </Card>

      <CollapsibleSection
        sectionId="wo-links"
        title="Linked purchase orders"
        summary={linksSummary}
        description="WO lines can only use lines from these distributor POs."
        headerActions={
          <div className="flex min-w-[18rem] flex-wrap items-center gap-2">
            <Select
              value={linkPoId}
              items={linkablePurchaseOrders.map((po) => ({
                value: po.id,
                label: po.name,
              }))}
              disabled={!isOpen || linkPo.isPending || linkablePurchaseOrders.length === 0}
              onValueChange={(value) => {
                if (value) setLinkPoId(value);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={isOpen ? "Select PO" : "WO locked"} />
              </SelectTrigger>
              <SelectContent>
                {linkablePurchaseOrders.map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              disabled={!isOpen || !linkPoId || linkPo.isPending}
              onClick={() => linkPo.mutate(linkPoId)}
            >
              <Plus className="size-4" />
              Link
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {wo.purchaseOrders.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-10 text-center text-sm text-muted-foreground sm:col-span-2">
              No purchase orders linked yet.
            </p>
          ) : (
            wo.purchaseOrders.map((row) => (
              <div
                key={row.purchaseOrder.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/purchase-orders/${row.purchaseOrder.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.purchaseOrder.name}
                  </Link>
                  {row.purchaseOrder.saleChannel?.name ? (
                    <p className="text-xs text-muted-foreground">{row.purchaseOrder.saleChannel.name}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!isOpen || unlinkPo.isPending}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: "Unlink this purchase order?",
                        description: "WO line allocations for this PO will be removed.",
                        confirmLabel: "Unlink",
                        variant: "destructive",
                      });
                      if (ok) unlinkPo.mutate(row.purchaseOrder.id);
                    })();
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="wo-allocations"
        title="Line allocations"
        summary={linesSummary}
        description="Quantities here count against the source PO line alongside MO allocations."
        headerActions={
          <Button
            type="button"
            size="sm"
            disabled={!isOpen || linesBusy}
            onClick={() => setAddLineOpen(true)}
          >
            <Plus className="size-4" />
            Add line
          </Button>
        }
      >
        {wo.lineAllocations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-12 text-center text-sm text-muted-foreground">
            No warehouse lines yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead className="w-32">Quantity</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {wo.lineAllocations.map((row) => (
                  <TableRow key={row.purchaseOrderLineId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <StorageObjectImage
                          reference={row.purchaseOrderLine.product.imageKey}
                          alt=""
                          className="size-11 shrink-0 rounded-md"
                          imgClassName="rounded-md"
                          objectFit="contain"
                        />
                        <div className="min-w-0">
                          <p className="font-medium">{row.purchaseOrderLine.product.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {row.purchaseOrderLine.product.sku}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        href={`/purchase-orders/${row.purchaseOrderLine.purchaseOrder.id}`}
                        className="hover:underline"
                      >
                        {row.purchaseOrderLine.purchaseOrder.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Input
                        key={`${row.purchaseOrderLineId}-${row.quantity}`}
                        type="number"
                        min={1}
                        defaultValue={row.quantity}
                        disabled={!isOpen || linesBusy}
                        onBlur={(event) => {
                          const quantity = Math.max(1, Number(event.target.value) || 1);
                          if (quantity !== row.quantity) {
                            patchLine.mutate({
                              purchaseOrderLineId: row.purchaseOrderLineId,
                              quantity,
                            });
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={!isOpen || linesBusy}
                        onClick={() => {
                          void (async () => {
                            const ok = await confirm({
                              title: "Remove this warehouse line?",
                              confirmLabel: "Remove",
                              variant: "destructive",
                            });
                            if (ok) deleteLine.mutate(row.purchaseOrderLineId);
                          })();
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="wo-shipments"
        title="Shipments"
        summary={shipmentsSummary}
        description="Tracking and shipping documents for this warehouse order."
      >
        <PoShipmentsSection
          shippings={wo.shippings}
          orderType="warehouse_order"
          orderId={warehouseOrderId}
          hideToolbar
        />
      </CollapsibleSection>

      <AddWarehouseOrderLineDialog
        open={addLineOpen}
        onOpenChange={setAddLineOpen}
        wo={wo}
        onSubmit={async (values) => {
          await addLine.mutateAsync(values);
        }}
      />
    </div>
  );
}
