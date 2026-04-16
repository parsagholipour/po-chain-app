"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { uploadFileToStorage } from "@/lib/upload-client";
import type { Manufacturer, Product, PurchaseOrderDetail, SaleChannel } from "@/lib/types/api";
import { ProductUpsertDialog } from "@/components/po/products/product-upsert-dialog";
import type { ProductFormValues } from "@/components/po/products/product-form";
import { AddPoLineDialog } from "@/components/po/purchase-order/add-po-line-dialog";
import { PoDetailHeader } from "@/components/po/purchase-order/po-detail-header";
import { PoLinesSection } from "@/components/po/purchase-order/po-lines-section";
import { PoLinkedMosSection } from "@/components/po/purchase-order/po-linked-mos-section";
import { PoShipmentsSection } from "@/components/po/purchase-order/po-shipments-section";
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
    queryFn: async () => {
      const { data } = await api.get<SaleChannel[]>("/api/sale-channels");
      return data;
    },
  });

  const distributorSaleChannelOptions = saleChannelOptions.filter(
    (sc) => sc.type === "distributor",
  );

  const { data: manufacturers = [], isPending: manufacturersPending } = useQuery({
    queryKey: ["manufacturers"] as const,
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
      toast.success("Updated");
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

  async function saveProductFromPo(payload: {
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
        saleChannelOptions={distributorSaleChannelOptions}
        onStatusChange={(s) => patchPo.mutate({ status: s })}
        onSaleChannelChange={(saleChannelId) => patchPo.mutate({ saleChannelId })}
        onDocumentUpload={uploadDocument}
        isSaving={patchPo.isPending}
        isDocumentSaving={isDocumentSaving}
        onDelete={() => deletePo.mutateAsync()}
        isDeleting={deletePo.isPending}
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
        orderType="purchase_order"
        orderId={purchaseOrderId}
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
        onSave={saveProductFromPo}
      />
    </div>
  );
}
