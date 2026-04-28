"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProductType } from "@/lib/types/api";
import {
  ProductTypeForm,
  emptyProductTypeFormValues,
  type ProductTypeFormValues,
} from "./product-type-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ProductType | null;
  onSave: (payload: { id?: string; values: ProductTypeFormValues }) => Promise<string>;
};

export function ProductTypeUpsertDialog({ open, onOpenChange, editing, onSave }: Props) {
  const resetKey = editing?.id ?? "new";
  const defaultValues: ProductTypeFormValues = editing
    ? {
        name: editing.name,
      }
    : emptyProductTypeFormValues();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit product type" : "New product type"}</DialogTitle>
        </DialogHeader>
        <ProductTypeForm
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
