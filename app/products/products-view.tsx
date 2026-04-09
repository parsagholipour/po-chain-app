"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { Manufacturer, Product } from "@/lib/types/api";
import { ProductUpsertDialog } from "@/components/po/products/product-upsert-dialog";
import { ProductsTable } from "@/components/po/products/products-table";
import type { ProductFormValues } from "@/components/po/products/product-form";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export type { Product } from "@/lib/types/api";

const productsKey = ["products"] as const;
const manufacturersKey = ["manufacturers"] as const;

export function ProductsView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data: manufacturers = [] } = useQuery({
    queryKey: manufacturersKey,
    queryFn: async () => {
      const { data: rows } = await api.get<Manufacturer[]>("/api/manufacturers");
      return rows;
    },
  });

  const { data = [], isPending } = useQuery({
    queryKey: productsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<Product[]>("/api/products");
      return rows;
    },
  });

  const createMut = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const { data: row } = await api.post<Product>("/api/products", {
        name: values.name,
        sku: values.sku,
        defaultManufacturerId: values.defaultManufacturerId,
        verified: values.verified,
        imageKey: values.imageKey,
        barcodeKey: values.barcodeKey,
        packagingKey: values.packagingKey,
      });
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKey });
      toast.success("Product created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const { data: row } = await api.patch<Product>(`/api/products/${id}`, body);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKey });
      toast.success("Product updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/products/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKey });
      toast.success("Product deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function handleSave(payload: {
    id?: string;
    values: ProductFormValues;
    patchImageKey: boolean;
    patchBarcodeKey: boolean;
    patchPackagingKey: boolean;
  }) {
    if (payload.id) {
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
      await updateMut.mutateAsync({ id: payload.id, body });
    } else {
      await createMut.mutateAsync(payload.values);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Catalog SKUs and default manufacturers.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          disabled={manufacturers.length === 0}
        >
          <Plus className="size-4" />
          Add product
        </Button>
      </div>
      {manufacturers.length === 0 ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Create at least one manufacturer before adding products.
        </p>
      ) : null}

      <ProductsTable
        rows={data}
        isPending={isPending}
        onEdit={(row) => {
          setEditing(row);
          setOpen(true);
        }}
        onDelete={(row) => deleteMut.mutate(row.id)}
      />

      <ProductUpsertDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        manufacturers={manufacturers}
        onSave={handleSave}
      />
    </div>
  );
}
