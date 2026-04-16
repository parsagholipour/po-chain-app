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
import { TableContainer } from "@/components/ui/table-container";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export type { Product } from "@/lib/types/api";

const productsKey = ["products"] as const;
const manufacturersKey = ["manufacturers"] as const;

export function ProductsView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data: manufacturers = [], isPending: manufacturersPending } = useQuery({
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
        cost: values.cost ?? null,
        price: values.price ?? null,
        defaultManufacturerId: values.defaultManufacturerId,
        categoryId: values.categoryId,
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
  }): Promise<string> {
    if (payload.id) {
      const body: Record<string, unknown> = {
        name: payload.values.name,
        sku: payload.values.sku,
        cost: payload.values.cost ?? null,
        price: payload.values.price ?? null,
        defaultManufacturerId: payload.values.defaultManufacturerId,
        categoryId: payload.values.categoryId,
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
      return payload.id;
    } else {
      const row = await createMut.mutateAsync(payload.values);
      return row.id;
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
          disabled={manufacturersPending || manufacturers.length === 0}
        >
          <Plus className="size-4" />
          Add product
        </Button>
      </div>
      {!manufacturersPending && manufacturers.length === 0 ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Create at least one manufacturer before adding products.
        </p>
      ) : null}

      <TableContainer>
        <ProductsTable
          rows={data}
          isPending={isPending}
          onEdit={(row) => {
            setEditing(row);
            setOpen(true);
          }}
          onDelete={(row) => deleteMut.mutate(row.id)}
        />
      </TableContainer>

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
