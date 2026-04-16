"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Manufacturer, Product, ProductCategory } from "@/lib/types/api";
import { ProductForm, type ProductFormValues } from "./product-form";

function moneyFieldDefault(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Product | null;
  manufacturers: Manufacturer[];
  onSave: (payload: {
    id?: string;
    values: ProductFormValues;
    patchImageKey: boolean;
    patchBarcodeKey: boolean;
    patchPackagingKey: boolean;
  }) => Promise<string>;
};

export function ProductUpsertDialog({
  open,
  onOpenChange,
  editing,
  manufacturers,
  onSave,
}: Props) {
  const { data: categories = [] } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const { data } = await api.get<ProductCategory[]>("/api/product-categories");
      return data;
    },
    enabled: open,
  });

  const resetKey = editing?.id ?? "new";
  const firstMf = manufacturers[0]?.id ?? "";
  const defaultValues: ProductFormValues = editing
    ? {
        name: editing.name,
        sku: editing.sku,
        cost: moneyFieldDefault(editing.cost),
        price: moneyFieldDefault(editing.price),
        defaultManufacturerId: editing.defaultManufacturerId,
        verified: editing.verified,
        categoryId: editing.categoryId ?? "none",
        imageKey: editing.imageKey,
        barcodeKey: editing.barcodeKey,
        packagingKey: editing.packagingKey,
      }
    : {
        name: "",
        sku: "",
        cost: null,
        price: null,
        defaultManufacturerId: firstMf,
        categoryId: "none",
        verified: false,
        imageKey: null,
        barcodeKey: null,
        packagingKey: null,
      };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
        </DialogHeader>
        <ProductForm
          key={open ? resetKey : "idle"}
          manufacturers={manufacturers}
          categories={categories}
          defaultValues={defaultValues}
          editingId={editing?.id}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (values, meta) => {
            const patchImageKey =
              !editing || meta.imageChanged || values.imageKey !== editing.imageKey;
            const patchBarcodeKey =
              !editing || meta.barcodeChanged || values.barcodeKey !== editing.barcodeKey;
            const patchPackagingKey =
              !editing ||
              meta.packagingChanged ||
              values.packagingKey !== editing.packagingKey;
            const entityId = await onSave({
              id: editing?.id,
              values,
              patchImageKey,
              patchBarcodeKey,
              patchPackagingKey,
            });
            onOpenChange(false);
            return entityId;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
