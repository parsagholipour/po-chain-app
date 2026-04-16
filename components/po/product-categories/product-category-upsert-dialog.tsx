"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProductCategory } from "@/lib/types/api";
import {
  ProductCategoryForm,
  emptyProductCategoryFormValues,
  type ProductCategoryFormValues,
} from "./product-category-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ProductCategory | null;
  onSave: (payload: { id?: string; values: ProductCategoryFormValues }) => Promise<string>;
};

export function ProductCategoryUpsertDialog({ open, onOpenChange, editing, onSave }: Props) {
  const resetKey = editing?.id ?? "new";
  const defaultValues: ProductCategoryFormValues = editing
    ? {
        name: editing.name,
      }
    : emptyProductCategoryFormValues();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit product category" : "New product category"}</DialogTitle>
        </DialogHeader>
        <ProductCategoryForm
          key={open ? resetKey : "idle"}
          defaultValues={defaultValues}
          editingId={editing?.id}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (values) => {
            const entityId = await onSave({ id: editing?.id, values });
            onOpenChange(false);
            return entityId;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
