"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  Manufacturer,
  Product,
  ProductCategory,
  ProductCollection,
  ProductType,
} from "@/lib/types/api";
import { ProductForm, type ProductFormValues } from "./product-form";

function moneyFieldDefault(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Product | null;
  manufacturers: Manufacturer[];
  onSave?: (payload: {
    id?: string;
    values: ProductFormValues;
    patchImageKey: boolean;
    patchBarcodeKey: boolean;
    patchPackagingKey: boolean;
  }) => Promise<string>;
  readOnly?: boolean;
};

export function ProductUpsertDialog({
  open,
  onOpenChange,
  editing,
  manufacturers,
  onSave,
  readOnly = false,
}: Props) {
  const { data: categories = [] } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const { data } = await api.get<ProductCategory[]>("/api/product-categories");
      return data;
    },
    enabled: open && !readOnly,
  });

  const { data: productTypes = [] } = useQuery({
    queryKey: ["product-types"],
    queryFn: async () => {
      const { data } = await api.get<ProductType[]>("/api/product-types");
      return data;
    },
    enabled: open && !readOnly,
  });

  const { data: productCollections = [] } = useQuery({
    queryKey: ["product-collections"],
    queryFn: async () => {
      const { data } = await api.get<ProductCollection[]>("/api/product-collections");
      return data;
    },
    enabled: open && !readOnly,
  });

  const resetKey = editing?.id ?? "new";
  const firstMf = manufacturers[0]?.id ?? "";
  const defaultValues: ProductFormValues = editing
    ? {
        name: editing.name,
        sku: editing.sku,
        upcGtin: editing.upcGtin ?? "",
        cost: moneyFieldDefault(editing.cost),
        price: moneyFieldDefault(editing.price),
        mop: editing.mop,
        map: moneyFieldDefault(editing.map),
        msrp: moneyFieldDefault(editing.msrp),
        quantityPerCarton: editing.quantityPerCarton,
        orderByDate: formatDateInputValue(editing.orderByDate),
        editingStatus: editing.editingStatus,
        description: editing.description ?? "",
        imageLink: editing.imageLink,
        defaultManufacturerId: editing.defaultManufacturerId,
        verified: editing.verified,
        categoryId: editing.categoryId ?? "none",
        typeId: editing.typeId ?? "none",
        collectionId: editing.collectionId ?? "none",
        imageKey: editing.imageKey,
        barcodeKey: editing.barcodeKey,
        packagingKey: editing.packagingKey,
      }
    : {
        name: "",
        sku: "",
        upcGtin: "",
        cost: null,
        price: null,
        mop: null,
        map: null,
        msrp: null,
        quantityPerCarton: null,
        orderByDate: "",
        editingStatus: null,
        description: "",
        imageLink: "",
        defaultManufacturerId: firstMf,
        categoryId: "none",
        typeId: "none",
        collectionId: "none",
        verified: false,
        imageKey: null,
        barcodeKey: null,
        packagingKey: null,
      };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="3xl">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? "View product" : editing ? "Edit product" : "New product"}
          </DialogTitle>
        </DialogHeader>
        <ProductForm
          key={open ? resetKey : "idle"}
          manufacturers={manufacturers}
          categories={readOnly && editing?.category ? [editing.category] : categories}
          productTypes={readOnly && editing?.type ? [editing.type] : productTypes}
          productCollections={
            readOnly && editing?.collection ? [editing.collection] : productCollections
          }
          defaultValues={defaultValues}
          stockCount={editing?.stockCount ?? null}
          editingId={editing?.id}
          readOnly={readOnly}
          onCancel={() => onOpenChange(false)}
          onSubmit={
            readOnly || !onSave
              ? undefined
              : async (values, meta) => {
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
                }
          }
        />
      </DialogContent>
    </Dialog>
  );
}
