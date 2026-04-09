"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Manufacturer, Product } from "@/lib/types/api";
import { ProductForm, type ProductFormValues } from "./product-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Product | null;
  manufacturers: Manufacturer[];
  onSave: (payload: {
    id?: string;
    values: ProductFormValues;
    patchImageKey: boolean;
  }) => Promise<void>;
};

export function ProductUpsertDialog({
  open,
  onOpenChange,
  editing,
  manufacturers,
  onSave,
}: Props) {
  const resetKey = editing?.id ?? "new";
  const firstMf = manufacturers[0]?.id ?? "";
  const defaultValues: ProductFormValues = editing
    ? {
        name: editing.name,
        sku: editing.sku,
        defaultManufacturerId: editing.defaultManufacturerId,
        verified: editing.verified,
        imageKey: editing.imageKey,
      }
    : {
        name: "",
        sku: "",
        defaultManufacturerId: firstMf,
        verified: false,
        imageKey: null,
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
          defaultValues={defaultValues}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (values, meta) => {
            const patchImageKey =
              !editing ||
              meta.hadNewImageFile ||
              meta.removeStoredImage ||
              values.imageKey !== editing.imageKey;
            await onSave({
              id: editing?.id,
              values,
              patchImageKey,
            });
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
