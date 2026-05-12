"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "nextjs-toploader/app";
import { useMemo, useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { uploadFileToStorage } from "@/lib/upload-client";
import type {
  Manufacturer,
  OrderStatusLog,
  PoOsd,
  Product,
  PurchaseOrderDetail,
  SaleChannel,
  SaleChannelLocation,
} from "@/lib/types/api";
import type { OsdCreateInput, OsdPatchInput } from "@/lib/validations/purchase-order";
import { ProductUpsertDialog } from "@/components/po/products/product-upsert-dialog";
import type { ProductFormValues } from "@/components/po/products/product-form";
import { productFormValuesToApiBody } from "@/components/po/products/product-payload";
import { AddPoLineDialog } from "@/components/po/purchase-order/add-po-line-dialog";
import { PoDetailHeader } from "@/components/po/purchase-order/po-detail-header";
import { PoLinesSection } from "@/components/po/purchase-order/po-lines-section";
import { PoLinkedMosSection } from "@/components/po/purchase-order/po-linked-mos-section";
import { PoLinkedWarehouseOrdersSection } from "@/components/po/purchase-order/po-linked-warehouse-orders-section";
import { PoShipmentsSection } from "@/components/po/purchase-order/po-shipments-section";
import { PoOrderInvoiceSection } from "@/components/po/purchase-order/po-order-invoice-section";
import { InvoiceUpsertDialog } from "@/components/po/purchase-order/invoice-upsert-dialog";
import { invoiceDefaultsForPivot } from "@/lib/po/invoice-defaults";
import type { InvoiceApiPayload, InvoiceFormValues } from "@/lib/po/invoice-form";
import { PoOsdSection } from "@/components/po/purchase-order/po-osd-section";
import { AddOsdDialog } from "@/components/po/purchase-order/add-osd-dialog";
import { toast } from "sonner";
import { invalidateNavCounts } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type { PurchaseOrderDetail } from "@/lib/types/api";

function PoDetailSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading purchase order">
      <Card className="border-border/80">
        <CardHeader className="gap-3 border-b border-border/60 pb-4">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-10 w-64" />
        </CardHeader>
      </Card>
      <Skeleton className="h-36 rounded-xl" />
    </div>
  );
}

export function PoDetailView({ purchaseOrderId }: { purchaseOrderId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const isDistributor = session?.user.type === "distributor";
  const poKey = ["purchase-order", purchaseOrderId] as const;

  const {
    data: po,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: poKey,
    queryFn: async () => {
      const { data } = await api.get<Extract<PurchaseOrderDetail, { type: "distributor" }>>(
        `/api/purchase-orders/${purchaseOrderId}`,
      );
      return data;
    },
  });

  const { data: saleChannelOptions = [] } = useQuery({
    queryKey: ["sale-channels"],
    enabled: sessionStatus !== "loading" && !isDistributor,
    queryFn: async () => {
      const { data } = await api.get<SaleChannel[]>("/api/sale-channels");
      return data;
    },
  });

  const distributorSaleChannelOptions = saleChannelOptions.filter(
    (sc) => sc.type === "distributor",
  );

  const currentSaleChannelId = po?.saleChannel?.id ?? "";
  const { data: saleChannelLocations = [], isPending: saleChannelLocationsPending } = useQuery({
    queryKey: ["sale-channel-locations", currentSaleChannelId],
    enabled: sessionStatus !== "loading" && !isDistributor && currentSaleChannelId.length > 0,
    queryFn: async () => {
      const { data } = await api.get<SaleChannelLocation[]>(
        `/api/sale-channels/${currentSaleChannelId}/locations`,
      );
      return data;
    },
  });

  const { data: manufacturers = [], isPending: manufacturersPending } = useQuery({
    queryKey: ["manufacturers"] as const,
    enabled: sessionStatus !== "loading" && !isDistributor,
    queryFn: async () => {
      const { data } = await api.get<Manufacturer[]>("/api/manufacturers");
      return data;
    },
  });

  const patchPo = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch<Extract<PurchaseOrderDetail, { type: "distributor" }>>(
        `/api/purchase-orders/${purchaseOrderId}`,
        body,
      );
      return data;
    },
    onSuccess: (row) => {
      qc.setQueryData(poKey, row);
      void invalidateNavCounts(qc);
      toast.success("Updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const patchInvoice = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      await api.patch(`/api/invoices/${id}`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: poKey });
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
      qc.setQueryData<Extract<PurchaseOrderDetail, { type: "distributor" }> | undefined>(
        poKey,
        (current) =>
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

  const deletePo = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/purchase-orders/${purchaseOrderId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["manufacturing-orders"] });
      qc.invalidateQueries({ queryKey: ["manufacturing-order"] });
      void invalidateNavCounts(qc);
      qc.removeQueries({ queryKey: poKey });
      toast.success("Purchase order deleted");
      router.push("/purchase-orders-overview");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const addLine = useMutation({
    mutationFn: async (body: { productId: string; quantity: number }) => {
      await api.post(`/api/purchase-orders/${purchaseOrderId}/lines`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: poKey });
      toast.success("Line added");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const patchLine = useMutation({
    mutationFn: async ({
      lineId,
      body,
    }: {
      lineId: string;
      body: Record<string, unknown>;
    }) => {
      await api.patch(`/api/purchase-orders/${purchaseOrderId}/lines/${lineId}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: poKey });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      toast.success("Line updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteLine = useMutation({
    mutationFn: async (lineId: string) => {
      await api.delete(`/api/purchase-orders/${purchaseOrderId}/lines/${lineId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: poKey });
      toast.success("Line removed");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const createOsd = useMutation({
    mutationFn: async (body: OsdCreateInput) => {
      await api.post(`/api/purchase-orders/${purchaseOrderId}/osds`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: poKey });
      toast.success("OS&D created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const patchOsd = useMutation({
    mutationFn: async ({ osdId, body }: { osdId: string; body: OsdPatchInput }) => {
      await api.patch(`/api/purchase-orders/${purchaseOrderId}/osds/${osdId}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: poKey });
      toast.success("OS&D updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteOsd = useMutation({
    mutationFn: async (osdId: string) => {
      await api.delete(`/api/purchase-orders/${purchaseOrderId}/osds/${osdId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: poKey });
      toast.success("OS&D removed");
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
      qc.invalidateQueries({ queryKey: poKey });
      toast.success("Product updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const [lineOpen, setLineOpen] = useState(false);
  const [productEditOpen, setProductEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isDocumentSaving, setIsDocumentSaving] = useState(false);
  const [osdDialogOpen, setOsdDialogOpen] = useState(false);
  const [osdDialogMode, setOsdDialogMode] = useState<"create" | "edit">("create");
  const [editingOsd, setEditingOsd] = useState<PoOsd | null>(null);
  const [invoiceDialogMode, setInvoiceDialogMode] = useState<"create" | "edit" | null>(null);

  async function saveProductFromPo(payload: {
    id?: string;
    values: ProductFormValues;
    patchImageKey: boolean;
    patchBarcodeKey: boolean;
    patchPackagingKey: boolean;
  }): Promise<string> {
    if (!payload.id) return "";
    const body = productFormValuesToApiBody(payload.values, {
      includeImageKey: payload.patchImageKey,
      includeBarcodeKey: payload.patchBarcodeKey,
      includePackagingKey: payload.patchPackagingKey,
    });
    await updateProduct.mutateAsync({ id: payload.id, body });
    return payload.id;
  }

  async function uploadDocument(file: File) {
    setIsDocumentSaving(true);
    try {
      const documentKey = await uploadFileToStorage(file, "purchase-orders");
      await patchPo.mutateAsync({ documentKey });
      toast.success("Document uploaded");
    } catch (e) {
      if (!axios.isAxiosError(e)) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
      throw e;
    } finally {
      setIsDocumentSaving(false);
    }
  }

  const linkedMos = po?.manufacturingOrderPurchaseOrders.map(
    (r) => r.manufacturingOrder,
  ) ?? [];
  const linkedWarehouseOrders = po?.warehouseOrderPurchaseOrders.map(
    (r) => r.warehouseOrder,
  ) ?? [];

  const invoiceDialogDefaults = useMemo((): InvoiceFormValues => {
    if (!po || !invoiceDialogMode) {
      return { invoiceNumber: "" };
    }
    return invoiceDefaultsForPivot(
      { invoice: po.invoice },
      invoiceDialogMode === "edit" ? "edit" : "create",
    );
  }, [po, invoiceDialogMode]);

  const invoiceResetToken = po
    ? `po-invoice-${invoiceDialogMode}-${po.invoice?.id ?? "new"}`
    : "";

  async function submitPurchaseOrderInvoice(payload: InvoiceApiPayload) {
    if (!po || !invoiceDialogMode) return;
    if (invoiceDialogMode === "edit" && po.invoice) {
      await patchInvoice.mutateAsync({
        id: po.invoice.id,
        body: payload,
      });
    } else {
      await patchPo.mutateAsync({ invoice: payload });
    }
    setInvoiceDialogMode(null);
  }

  if (isPending) {
    return <PoDetailSkeleton />;
  }

  if (isError) {
    const notFound = axios.isAxiosError(error) && error.response?.status === 404;
    if (notFound) {
      return (
        <div className="mx-auto max-w-lg py-6 sm:py-10">
          <Card className="border-dashed border-border/80 text-center">
            <CardHeader>
              <CardTitle className="text-lg">Purchase order not found</CardTitle>
              <CardDescription>
                It may have been removed, or the link is incorrect.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center border-t bg-transparent">
              <Link
                href="/purchase-orders-overview"
                className={cn(buttonVariants({ variant: "default" }))}
              >
                Back to purchase orders
              </Link>
            </CardFooter>
          </Card>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-lg py-6 sm:py-10">
        <Card className="border-border/80 text-center shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Couldn&apos;t load this purchase order</CardTitle>
            <CardDescription className="text-pretty">{apiErrorMessage(error)}</CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-wrap justify-center gap-2 border-t bg-transparent">
            <Button
              type="button"
              variant="default"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Retrying…" : "Try again"}
            </Button>
            <Link
              href="/purchase-orders-overview"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Back to list
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!po) {
    return (
      <div className="mx-auto max-w-lg py-6 sm:py-10">
        <Card className="border-dashed border-border/80 text-center">
          <CardHeader>
            <CardTitle className="text-lg">Purchase order not found</CardTitle>
            <CardDescription>
              It may have been removed, or the link is incorrect.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center border-t bg-transparent">
            <Link
              href="/purchase-orders-overview"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Back to purchase orders
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PoDetailHeader
        po={po}
        statusLogs={po.statusLogs}
        saleChannelOptions={distributorSaleChannelOptions}
        onStatusChange={!isDistributor ? (s) => patchPo.mutate({ status: s }) : undefined}
        onSaveStatusLogNote={
          !isDistributor
            ? async (logId, note) => {
                await saveStatusLogNote.mutateAsync({ logId, note });
              }
            : undefined
        }
        onSaleChannelChange={
          !isDistributor ? (saleChannelId) => patchPo.mutate({ saleChannelId }) : undefined
        }
        saleChannelLocations={saleChannelLocations}
        saleChannelLocationsPending={saleChannelLocationsPending}
        onLocationChange={
          !isDistributor
            ? (saleChannelLocationId) => patchPo.mutate({ saleChannelLocationId })
            : undefined
        }
        onDocumentUpload={!isDistributor ? uploadDocument : undefined}
        isSaving={patchPo.isPending}
        isDocumentSaving={isDocumentSaving}
        onDelete={!isDistributor ? () => deletePo.mutateAsync() : undefined}
        isDeleting={deletePo.isPending}
      />

      {!isDistributor ? (
        <PoOrderInvoiceSection
          invoice={po.invoice}
          onCreate={() => setInvoiceDialogMode("create")}
          onEdit={() => setInvoiceDialogMode("edit")}
        />
      ) : null}

      <PoLinesSection
        lines={po.lines}
        onAddLine={!isDistributor ? () => setLineOpen(true) : undefined}
        onPatchLine={!isDistributor ? (lineId, body) => patchLine.mutate({ lineId, body }) : undefined}
        onDeleteLine={!isDistributor ? (lineId) => deleteLine.mutate(lineId) : undefined}
        lineMutationPending={patchLine.isPending}
        onEditProduct={
          !isDistributor && !manufacturersPending && manufacturers.length > 0
            ? (product) => {
                setEditingProduct(product);
                setProductEditOpen(true);
              }
            : undefined
        }
        readOnly={isDistributor}
      />

      {!isDistributor ? (
        <PoOsdSection
          osds={po.osds}
          onNew={() => {
            setOsdDialogMode("create");
            setEditingOsd(null);
            setOsdDialogOpen(true);
          }}
          onEdit={(osd) => {
            setOsdDialogMode("edit");
            setEditingOsd(osd);
            setOsdDialogOpen(true);
          }}
          onDelete={(id) => deleteOsd.mutate(id)}
          busy={deleteOsd.isPending || patchOsd.isPending || createOsd.isPending}
        />
      ) : null}

      {!isDistributor ? <PoLinkedMosSection manufacturingOrders={linkedMos} /> : null}

      {!isDistributor ? (
        <PoLinkedWarehouseOrdersSection warehouseOrders={linkedWarehouseOrders} />
      ) : null}

      <PoShipmentsSection
        shippings={po.shippings}
        orderType="purchase_order"
        orderId={purchaseOrderId}
        readOnly={isDistributor}
      />

      {!isDistributor ? (
        <>
          <AddPoLineDialog
            open={lineOpen}
            onOpenChange={setLineOpen}
            onSubmit={(v) => addLine.mutateAsync(v)}
          />

          <AddOsdDialog
            key={
              osdDialogOpen ? `osd-${osdDialogMode}-${editingOsd?.id ?? "new"}` : "osd-shut"
            }
            open={osdDialogOpen}
            onOpenChange={setOsdDialogOpen}
            lines={po.lines}
            mode={osdDialogMode}
            editing={editingOsd}
            onCreate={(body) => createOsd.mutateAsync(body)}
            onEdit={(osdId, body) => patchOsd.mutateAsync({ osdId, body })}
          />

          <ProductUpsertDialog
            open={productEditOpen}
            onOpenChange={(o) => {
              setProductEditOpen(o);
              if (!o) setEditingProduct(null);
            }}
            editing={editingProduct}
            manufacturers={manufacturers}
            onSave={saveProductFromPo}
          />

          <InvoiceUpsertDialog
            open={!!invoiceDialogMode}
            onOpenChange={(o) => {
              if (!o) setInvoiceDialogMode(null);
            }}
            title={invoiceDialogMode === "edit" ? "Edit invoice" : "Create invoice"}
            defaultValues={invoiceDialogDefaults}
            existingDocumentKey={po.invoice?.documentKey ?? null}
            resetToken={invoiceResetToken}
            onSubmit={submitPurchaseOrderInvoice}
          />
        </>
      ) : null}
    </div>
  );
}
