"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { uploadFileToStorage } from "@/lib/upload-client";
import type {
  Manufacturer,
  OrderStatusLog,
  Product,
  PurchaseOrderDetail,
  SaleChannel,
} from "@/lib/types/api";
import { ProductUpsertDialog } from "@/components/po/products/product-upsert-dialog";
import type { ProductFormValues } from "@/components/po/products/product-form";
import { AddPoLineDialog } from "@/components/po/purchase-order/add-po-line-dialog";
import { PoDetailHeader } from "@/components/po/purchase-order/po-detail-header";
import { PoLinesSection } from "@/components/po/purchase-order/po-lines-section";
import { PoLinkedMosSection } from "@/components/po/purchase-order/po-linked-mos-section";
import { PoShipmentsSection } from "@/components/po/purchase-order/po-shipments-section";
import { PoOrderInvoiceSection } from "@/components/po/purchase-order/po-order-invoice-section";
import { InvoiceUpsertDialog } from "@/components/po/purchase-order/invoice-upsert-dialog";
import { invoiceDefaultsForPivot } from "@/lib/po/invoice-defaults";
import type { InvoiceApiPayload, InvoiceFormValues } from "@/lib/po/invoice-form";
import { invalidateNavCounts } from "@/lib/query-invalidation";
import { toast } from "sonner";
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

function StockOrderDetailSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading stock order">
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

export function StockOrderDetailView({ stockOrderId }: { stockOrderId: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const soKey = ["stock-order", stockOrderId] as const;

  const {
    data: po,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: soKey,
    queryFn: async () => {
      const { data } = await api.get<Extract<PurchaseOrderDetail, { type: "stock" }>>(
        `/api/stock-orders/${stockOrderId}`,
      );
      return data;
    },
  });

  const { data: saleChannelOptions = [] } = useQuery({
    queryKey: ["sale-channels"],
    queryFn: async () => {
      const { data } = await api.get<SaleChannel[]>("/api/sale-channels");
      return data;
    },
  });

  const nonDistributorSaleChannelOptions = saleChannelOptions.filter(
    (sc) => sc.type !== "distributor",
  );

  const { data: manufacturers = [], isPending: manufacturersPending } = useQuery({
    queryKey: ["manufacturers"] as const,
    queryFn: async () => {
      const { data } = await api.get<Manufacturer[]>("/api/manufacturers");
      return data;
    },
  });

  const patchSo = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch<Extract<PurchaseOrderDetail, { type: "stock" }>>(
        `/api/stock-orders/${stockOrderId}`,
        body,
      );
      return data;
    },
    onSuccess: (row) => {
      qc.setQueryData(soKey, row);
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
      void qc.invalidateQueries({ queryKey: soKey });
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
      qc.setQueryData<Extract<PurchaseOrderDetail, { type: "stock" }> | undefined>(
        soKey,
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

  const deleteSo = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/stock-orders/${stockOrderId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-orders"] });
      qc.invalidateQueries({ queryKey: ["manufacturing-orders"] });
      qc.invalidateQueries({ queryKey: ["manufacturing-order"] });
      void invalidateNavCounts(qc);
      qc.removeQueries({ queryKey: soKey });
      toast.success("Stock order deleted");
      router.push("/stock-orders");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const addLine = useMutation({
    mutationFn: async (body: { productId: string; quantity: number }) => {
      await api.post(`/api/stock-orders/${stockOrderId}/lines`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: soKey });
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
      await api.patch(`/api/stock-orders/${stockOrderId}/lines/${lineId}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: soKey });
      toast.success("Line updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteLine = useMutation({
    mutationFn: async (lineId: string) => {
      await api.delete(`/api/stock-orders/${stockOrderId}/lines/${lineId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: soKey });
      toast.success("Line removed");
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
      qc.invalidateQueries({ queryKey: soKey });
      toast.success("Product updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const [lineOpen, setLineOpen] = useState(false);
  const [productEditOpen, setProductEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isDocumentSaving, setIsDocumentSaving] = useState(false);
  const [invoiceDialogMode, setInvoiceDialogMode] = useState<"create" | "edit" | null>(null);

  async function saveProductFromSo(payload: {
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

  async function uploadDocument(file: File) {
    setIsDocumentSaving(true);
    try {
      const documentKey = await uploadFileToStorage(file, "purchase-orders");
      await patchSo.mutateAsync({ documentKey });
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

  const linkedMos = po?.manufacturingOrderPurchaseOrders.map((r) => r.manufacturingOrder) ?? [];

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
    ? `so-invoice-${invoiceDialogMode}-${po.invoice?.id ?? "new"}`
    : "";

  async function submitStockOrderInvoice(payload: InvoiceApiPayload) {
    if (!po || !invoiceDialogMode) return;
    if (invoiceDialogMode === "edit" && po.invoice) {
      await patchInvoice.mutateAsync({
        id: po.invoice.id,
        body: payload,
      });
    } else {
      await patchSo.mutateAsync({ invoice: payload });
    }
    setInvoiceDialogMode(null);
  }

  if (isPending) {
    return <StockOrderDetailSkeleton />;
  }

  if (isError) {
    const notFound = axios.isAxiosError(error) && error.response?.status === 404;
    if (notFound) {
      return (
        <div className="mx-auto max-w-lg py-6 sm:py-10">
          <Card className="border-dashed border-border/80 text-center">
            <CardHeader>
              <CardTitle className="text-lg">Stock order not found</CardTitle>
              <CardDescription>
                It may have been removed, or the link is incorrect.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center border-t bg-transparent">
              <Link href="/stock-orders" className={cn(buttonVariants({ variant: "default" }))}>
                Back to stock orders
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
            <CardTitle className="text-lg">Couldn&apos;t load this stock order</CardTitle>
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
            <Link href="/stock-orders" className={cn(buttonVariants({ variant: "outline" }))}>
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
            <CardTitle className="text-lg">Stock order not found</CardTitle>
            <CardDescription>
              It may have been removed, or the link is incorrect.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center border-t bg-transparent">
            <Link href="/stock-orders" className={cn(buttonVariants({ variant: "default" }))}>
              Back to stock orders
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
        saleChannelOptions={nonDistributorSaleChannelOptions}
        onStatusChange={(s) => patchSo.mutate({ status: s })}
        onSaveStatusLogNote={async (logId, note) => {
          await saveStatusLogNote.mutateAsync({ logId, note });
        }}
        onSaleChannelChange={(saleChannelId) => patchSo.mutate({ saleChannelId })}
        onDocumentUpload={uploadDocument}
        isSaving={patchSo.isPending}
        isDocumentSaving={isDocumentSaving}
        onDelete={() => deleteSo.mutateAsync()}
        isDeleting={deleteSo.isPending}
      />

      <PoOrderInvoiceSection
        invoice={po.invoice}
        onCreate={() => setInvoiceDialogMode("create")}
        onEdit={() => setInvoiceDialogMode("edit")}
      />

      <PoLinesSection
        lines={po.lines}
        onAddLine={() => setLineOpen(true)}
        onPatchLine={(lineId, body) => patchLine.mutate({ lineId, body })}
        onDeleteLine={(lineId) => deleteLine.mutate(lineId)}
        lineMutationPending={patchLine.isPending}
        onEditProduct={
          !manufacturersPending && manufacturers.length > 0
            ? (product) => {
                setEditingProduct(product);
                setProductEditOpen(true);
              }
            : undefined
        }
      />

      <PoLinkedMosSection manufacturingOrders={linkedMos} />

      <PoShipmentsSection
        shippings={po.shippings}
        orderType="stock_order"
        orderId={stockOrderId}
      />

      <AddPoLineDialog
        open={lineOpen}
        onOpenChange={setLineOpen}
        onSubmit={(v) => addLine.mutateAsync(v)}
      />

      <ProductUpsertDialog
        open={productEditOpen}
        onOpenChange={(o) => {
          setProductEditOpen(o);
          if (!o) setEditingProduct(null);
        }}
        editing={editingProduct}
        manufacturers={manufacturers}
        onSave={saveProductFromSo}
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
        onSubmit={submitStockOrderInvoice}
      />
    </div>
  );
}
