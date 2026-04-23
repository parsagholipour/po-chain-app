"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { invalidateNavCounts } from "@/lib/query-invalidation";
import { invoiceDefaultsForPivot } from "@/lib/po/invoice-defaults";
import type {
  Manufacturer,
  ManufacturingOrderDetail,
  MoManufacturerPivot,
  OrderStatusLog,
  Product,
} from "@/lib/types/api";
import { ProductUpsertDialog } from "@/components/po/products/product-upsert-dialog";
import type { ProductFormValues } from "@/components/po/products/product-form";
import { InvoiceUpsertDialog } from "@/components/po/purchase-order/invoice-upsert-dialog";
import { ManufacturerUpsertDialog } from "@/components/po/manufacturers/manufacturer-upsert-dialog";
import type { ManufacturerFormValues } from "@/components/po/manufacturers/manufacturer-form";
import { PoManufacturersSection } from "@/components/po/purchase-order/po-manufacturers-section";
import { StatusChangeDialog, EditPivotDetailsDialog, type StatusChangeTarget } from "@/components/po/purchase-order/status-change-dialog";
import { PoShipmentsSection } from "@/components/po/purchase-order/po-shipments-section";
import { MoDetailHeader } from "@/components/po/manufacturing-order/mo-detail-header";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { MoLinksSection } from "@/components/po/manufacturing-order/mo-links-section";
import { MoAllocationsSection } from "@/components/po/manufacturing-order/mo-allocations-section";
import { AddMoLineAllocationDialog } from "@/components/po/manufacturing-order/add-mo-line-allocation-dialog";
import type { InvoiceApiPayload, InvoiceFormValues } from "@/lib/po/invoice-form";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";

export type { ManufacturingOrderDetail } from "@/lib/types/api";

function MoDetailSkeleton() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-6 px-4 pb-10 sm:px-6"
      aria-busy="true"
      aria-label="Loading manufacturing order"
    >
      <Card className="border-border/80 shadow-sm ring-border/40">
        <CardHeader className="gap-3 border-b border-border/60 pb-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full max-w-md" />
          <div className="flex flex-wrap gap-2 pt-1">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        </CardHeader>
      </Card>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm ring-1 ring-border/40"
        >
          <div className="flex items-center gap-3 border-b border-border/60 bg-muted/10 px-4 py-3.5">
            <Skeleton className="size-5 shrink-0 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="space-y-3 p-4">
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MoDetailView({ manufacturingOrderId }: { manufacturingOrderId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const moKey = ["manufacturing-order", manufacturingOrderId] as const;

  const {
    data: mo,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: moKey,
    queryFn: async () => {
      const { data } = await api.get<ManufacturingOrderDetail>(
        `/api/manufacturing-orders/${manufacturingOrderId}`,
      );
      return data;
    },
  });

  const { data: distributorPoList = [], isPending: distributorPoListPending } = useQuery({
    queryKey: ["purchase-orders", "list-all-for-mo"],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; number: number; name: string }[]>(
        "/api/purchase-orders?status=open",
      );
      return data;
    },
  });

  const { data: stockOrderList = [], isPending: stockOrderListPending } = useQuery({
    queryKey: ["stock-orders", "list-all-for-mo"],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; number: number; name: string }[]>(
        "/api/stock-orders?status=open",
      );
      return data;
    },
  });

  const linkableOrders = useMemo(
    () =>
      [
        ...distributorPoList.map((o) => ({
          ...o,
          type: "distributor" as const,
        })),
        ...stockOrderList.map((o) => ({
          ...o,
          type: "stock" as const,
        })),
      ].sort((a, b) => a.number - b.number),
    [distributorPoList, stockOrderList],
  );

  const { data: manufacturers = [] } = useQuery({
    queryKey: ["manufacturers"] as const,
    queryFn: async () => {
      const { data } = await api.get<Manufacturer[]>("/api/manufacturers");
      return data;
    },
  });

  const patchMo = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch<ManufacturingOrderDetail>(
        `/api/manufacturing-orders/${manufacturingOrderId}`,
        body,
      );
      return data;
    },
    onSuccess: (row) => {
      qc.setQueryData(moKey, row);
      void invalidateNavCounts(qc);
      toast.success("Updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMo = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/manufacturing-orders/${manufacturingOrderId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufacturing-orders", "list"] });
      qc.invalidateQueries({ queryKey: ["manufacturing-orders", "open-counts"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["stock-orders"] });
      qc.invalidateQueries({ queryKey: ["manufacturing-order"] });
      void invalidateNavCounts(qc);
      qc.removeQueries({ queryKey: moKey });
      toast.success("Manufacturing order deleted");
      router.push("/manufacturing-orders");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const patchMf = useMutation({
    mutationFn: async ({
      manufacturerId,
      body,
    }: {
      manufacturerId: string;
      body: Record<string, unknown>;
    }) => {
      await api.patch(
        `/api/manufacturing-orders/${manufacturingOrderId}/manufacturers/${manufacturerId}`,
        body,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: moKey });
      toast.success("Updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const patchInvoice = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      await api.patch(`/api/invoices/${id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: moKey });
      toast.success("Invoice saved");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const saveStatusLogNote = useMutation({
    mutationFn: async ({
      logId,
      note,
    }: {
      logId: string;
      note: string | null;
    }) => {
      const { data } = await api.patch<OrderStatusLog>(`/api/order-status-logs/${logId}`, {
        note,
      });
      return data;
    },
    onSuccess: (updatedLog) => {
      qc.setQueryData<ManufacturingOrderDetail | undefined>(moKey, (current) =>
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

  const setMoData = (row: ManufacturingOrderDetail) => {
    qc.setQueryData(moKey, row);
  };

  const addPo = useMutation({
    mutationFn: async (purchaseOrderId: string) => {
      const { data } = await api.post<ManufacturingOrderDetail>(
        `/api/manufacturing-orders/${manufacturingOrderId}/purchase-orders`,
        { purchaseOrderId },
      );
      return data;
    },
    onSuccess: setMoData,
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const removePo = useMutation({
    mutationFn: async (purchaseOrderId: string) => {
      const { data } = await api.delete<ManufacturingOrderDetail>(
        `/api/manufacturing-orders/${manufacturingOrderId}/purchase-orders/${purchaseOrderId}`,
      );
      return data;
    },
    onSuccess: setMoData,
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const addAlloc = useMutation({
    mutationFn: async (body: {
      purchaseOrderLineId: string;
      manufacturerId: string;
      verified?: boolean;
    }) => {
      const { data } = await api.post<ManufacturingOrderDetail>(
        `/api/manufacturing-orders/${manufacturingOrderId}/lines`,
        body,
      );
      return data;
    },
    onSuccess: setMoData,
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const patchAlloc = useMutation({
    mutationFn: async ({
      purchaseOrderLineId,
      body,
    }: {
      purchaseOrderLineId: string;
      body: Record<string, unknown>;
    }) => {
      const { data } = await api.patch<ManufacturingOrderDetail>(
        `/api/manufacturing-orders/${manufacturingOrderId}/lines/${purchaseOrderLineId}`,
        body,
      );
      return data;
    },
    onSuccess: setMoData,
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteAlloc = useMutation({
    mutationFn: async (purchaseOrderLineId: string) => {
      const { data } = await api.delete<ManufacturingOrderDetail>(
        `/api/manufacturing-orders/${manufacturingOrderId}/lines/${purchaseOrderLineId}`,
      );
      return data;
    },
    onSuccess: setMoData,
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateManufacturer = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ManufacturerFormValues }) => {
      const { data } = await api.patch<Manufacturer>(`/api/manufacturers/${id}`, values);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manufacturers"] });
      qc.invalidateQueries({ queryKey: moKey });
      setManufacturerModal(null);
      toast.success("Manufacturer updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const { data } = await api.patch<Product>(`/api/products/${id}`, body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: moKey });
      toast.success("Product updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const [statusChangeTarget, setStatusChangeTarget] = useState<StatusChangeTarget | null>(null);
  const [editStepRow, setEditStepRow] = useState<MoManufacturerPivot | null>(null);

  const [invoiceTarget, setInvoiceTarget] = useState<{
    row: MoManufacturerPivot;
    mode: "create" | "edit";
  } | null>(null);
  const [allocOpen, setAllocOpen] = useState(false);
  const [productEditOpen, setProductEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [manufacturerModal, setManufacturerModal] = useState<Manufacturer | null>(null);

  const invoiceDialogDefaults = useMemo(() => {
    if (!invoiceTarget) {
      return { invoiceNumber: "" } satisfies InvoiceFormValues;
    }
    return invoiceDefaultsForPivot(invoiceTarget.row, invoiceTarget.mode);
  }, [invoiceTarget]);

  const invoiceResetToken = invoiceTarget
    ? `${invoiceTarget.row.manufacturerId}-${invoiceTarget.mode}-${invoiceTarget.row.invoice?.id ?? "new"}`
    : "";

  async function submitInvoice(payload: InvoiceApiPayload) {
    if (!invoiceTarget) return;
    if (invoiceTarget.row.invoice && invoiceTarget.mode === "edit") {
      await patchInvoice.mutateAsync({
        id: invoiceTarget.row.invoice.id,
        body: payload,
      });
    } else {
      await patchMf.mutateAsync({
        manufacturerId: invoiceTarget.row.manufacturerId,
        body: { invoice: payload },
      });
    }
  }

  async function saveProductFromMo(payload: {
    id?: string;
    values: ProductFormValues;
    patchImageKey: boolean;
    patchBarcodeKey: boolean;
    patchPackagingKey: boolean;
  }): Promise<string> {
    if (!payload.id) return "";
    const body: Record<string, unknown> = {
      name: payload.values.name,
      sku: payload.values.sku,
      defaultManufacturerId: payload.values.defaultManufacturerId,
      verified: payload.values.verified,
    };
    if (payload.patchImageKey) {
      body.imageKey = payload.values.imageKey;
    }
    if (payload.patchBarcodeKey) {
      body.barcodeKey = payload.values.barcodeKey;
    }
    if (payload.patchPackagingKey) {
      body.packagingKey = payload.values.packagingKey;
    }
    await updateProduct.mutateAsync({ id: payload.id, body });
    return payload.id;
  }

  if (isPending) {
    return <MoDetailSkeleton />;
  }

  if (isError) {
    const notFound = axios.isAxiosError(error) && error.response?.status === 404;
    if (notFound) {
      return (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
          <div className="mx-auto max-w-lg">
          <Card className="border-dashed border-border/80 text-center">
            <CardHeader>
              <CardTitle className="text-lg">Manufacturing order not found</CardTitle>
              <CardDescription>
                It may have been removed, or the link is incorrect.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center border-t bg-transparent">
              <Link
                href="/manufacturing-orders"
                className={cn(buttonVariants({ variant: "default" }))}
              >
                Back to manufacturing orders
              </Link>
            </CardFooter>
          </Card>
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
        <div className="mx-auto max-w-lg">
        <Card className="border-border/80 text-center shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Couldn&apos;t load this manufacturing order</CardTitle>
            <CardDescription className="text-pretty">{apiErrorMessage(error)}</CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-wrap justify-center gap-2 border-t bg-transparent">
            <Button type="button" variant="default" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Retrying…" : "Try again"}
            </Button>
            <Link href="/manufacturing-orders" className={cn(buttonVariants({ variant: "outline" }))}>
              Back to list
            </Link>
          </CardFooter>
        </Card>
        </div>
      </div>
    );
  }

  if (!mo) {
    return null;
  }

  const linksPending =
    addPo.isPending ||
    removePo.isPending ||
    addAlloc.isPending ||
    patchAlloc.isPending ||
    deleteAlloc.isPending;

  const allocBusy =
    addAlloc.isPending || patchAlloc.isPending || deleteAlloc.isPending;

  const poCount = mo.purchaseOrders.filter((r) => r.purchaseOrder.type === "distributor").length;
  const soCount = mo.purchaseOrders.filter((r) => r.purchaseOrder.type === "stock").length;
  const linkedTotal = mo.purchaseOrders.length;

  const linksSummary =
    linkedTotal === 0
      ? "Nothing linked yet"
      : `${linkedTotal} order${linkedTotal === 1 ? "" : "s"} (${poCount} PO · ${soCount} SO)`;

  const manufacturersSummary =
    mo.manufacturers.length === 0
      ? "No manufacturers"
      : `${mo.manufacturers.length} manufacturer${mo.manufacturers.length === 1 ? "" : "s"}`;

  const allocationsSummary =
    mo.lineAllocations.length === 0
      ? "No lines allocated"
      : `${mo.lineAllocations.length} line${mo.lineAllocations.length === 1 ? "" : "s"}`;

  const shipmentsSummary =
    mo.shippings.length === 0
      ? "No shipments"
      : `${mo.shippings.length} shipment${mo.shippings.length === 1 ? "" : "s"}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-10 sm:px-6">
      <MoDetailHeader
        mo={mo}
        statusLogs={mo.statusLogs}
        onStatusChange={(s) => patchMo.mutate({ status: s })}
        onSaveStatusLogNote={async (logId, note) => {
          await saveStatusLogNote.mutateAsync({ logId, note });
        }}
        isSaving={patchMo.isPending}
        onDelete={() => deleteMo.mutateAsync()}
        isDeleting={deleteMo.isPending}
      />

      <CollapsibleSection
        sectionId="mo-links"
        title="Orders linked to this MO"
        summary={linksSummary}
        description={
          <>
            Connect distributor POs or stock orders so you can allocate their lines to manufacturers.{" "}
            <Link
              href="/purchase-orders-overview"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Browse POs
            </Link>
            {" · "}
            <Link href="/stock-orders" className="font-medium text-primary underline-offset-4 hover:underline">
              Browse stock orders
            </Link>
          </>
        }
      >
        <MoLinksSection
          mo={mo}
          linkableOrders={linkableOrders}
          poLinkCatalogPending={distributorPoListPending}
          soLinkCatalogPending={stockOrderListPending}
          onAddPurchaseOrder={(id) => addPo.mutate(id)}
          onRemovePurchaseOrder={(id) => removePo.mutate(id)}
          pending={linksPending}
          embedded
        />
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="mo-manufacturers"
        title="Manufacturers & invoices"
        summary={manufacturersSummary}
        description="Status and invoices per manufacturer on this manufacturing order."
      >
        <PoManufacturersSection
          manufacturers={mo.manufacturers}
          hideHeading
          onPivotStatusChange={(manufacturerId, status) => {
            const relatedAllocations = mo.lineAllocations.filter(
              (a) => a.manufacturerId === manufacturerId,
            );
            const allVerified = relatedAllocations.every((a) => a.verified);
            if (relatedAllocations.length > 0 && !allVerified) {
              toast.error(
                "All line allocations for this manufacturer must be verified before changing status.",
              );
              return;
            }
            const row = mo.manufacturers.find((m) => m.manufacturerId === manufacturerId);
            if (row) setStatusChangeTarget({ row, targetStatus: status });
          }}
          onCreateInvoice={(row) => setInvoiceTarget({ row, mode: "create" })}
          onEditInvoice={(row) => setInvoiceTarget({ row, mode: "edit" })}
          onEditStepDetails={(row) => setEditStepRow(row)}
          onEditManufacturer={(manufacturerId) => {
            const m = manufacturers.find((x) => x.id === manufacturerId);
            if (m) setManufacturerModal(m);
            else toast.error("Manufacturer not found");
          }}
        />
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="mo-allocations"
        title="Line allocations"
        summary={allocationsSummary}
        description="Assign PO/SO lines to manufacturers and mark verification when ready."
        headerActions={
          <Button type="button" size="sm" onClick={() => setAllocOpen(true)} disabled={allocBusy}>
            <Plus className="size-4" />
            Add allocation
          </Button>
        }
      >
        <MoAllocationsSection
          allocations={mo.lineAllocations}
          manufacturerOptions={mo.manufacturers}
          onAdd={() => setAllocOpen(true)}
          onPatch={(purchaseOrderLineId, body) => {
            if (body.verified === false) {
              const alloc = mo.lineAllocations.find(
                (a) => a.purchaseOrderLineId === purchaseOrderLineId,
              );
              const pivot = mo.manufacturers.find(
                (m) => m.manufacturerId === alloc?.manufacturerId,
              );
              if (pivot && pivot.status !== "initial") {
                toast.error(
                  "You can only unverify lines while this manufacturer's pivot status is Initial.",
                );
                return;
              }
            }
            patchAlloc.mutate({ purchaseOrderLineId, body });
          }}
          onDelete={(purchaseOrderLineId) => deleteAlloc.mutate(purchaseOrderLineId)}
          busy={allocBusy}
          hideToolbar
        />
      </CollapsibleSection>

      <CollapsibleSection
        sectionId="mo-shipments"
        title="Shipments"
        summary={shipmentsSummary}
        description="Tracking and shipping documents for this manufacturing order."
      >
        <PoShipmentsSection
          shippings={mo.shippings}
          orderType="manufacturing_order"
          orderId={manufacturingOrderId}
          hideToolbar
        />
      </CollapsibleSection>

      <EditPivotDetailsDialog
        open={!!editStepRow}
        onOpenChange={(o) => { if (!o) setEditStepRow(null); }}
        row={editStepRow}
        onSave={async (manufacturerId, body) => {
          await patchMf.mutateAsync({ manufacturerId, body });
        }}
      />

      <StatusChangeDialog
        open={!!statusChangeTarget}
        onOpenChange={(o) => { if (!o) setStatusChangeTarget(null); }}
        target={statusChangeTarget}
        onConfirm={async (manufacturerId, body) => {
          await patchMf.mutateAsync({ manufacturerId, body });
        }}
      />

      <InvoiceUpsertDialog
        open={!!invoiceTarget}
        onOpenChange={(o) => {
          if (!o) setInvoiceTarget(null);
        }}
        title={invoiceTarget?.mode === "edit" ? "Edit invoice" : "Create invoice"}
        defaultValues={invoiceDialogDefaults}
        existingDocumentKey={invoiceTarget?.row.invoice?.documentKey ?? null}
        resetToken={invoiceResetToken}
        onSubmit={submitInvoice}
      />

      <AddMoLineAllocationDialog
        open={allocOpen}
        onOpenChange={setAllocOpen}
        mo={mo}
        onSubmit={async (v) => {
          await addAlloc.mutateAsync(v);
        }}
      />

      <ProductUpsertDialog
        open={productEditOpen}
        onOpenChange={(o) => {
          setProductEditOpen(o);
          if (!o) setEditingProduct(null);
        }}
        editing={editingProduct}
        manufacturers={manufacturers}
        onSave={saveProductFromMo}
      />

      <ManufacturerUpsertDialog
        open={!!manufacturerModal}
        onOpenChange={(o) => {
          if (!o) setManufacturerModal(null);
        }}
        editing={manufacturerModal}
        onSave={async (payload) => {
          if (!payload.id) return "";
          await updateManufacturer.mutateAsync({ id: payload.id, values: payload.values });
          return payload.id;
        }}
      />
    </div>
  );
}
