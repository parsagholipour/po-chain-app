"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProductCollection } from "@/lib/types/api";
import {
  ProductCollectionForm,
  emptyProductCollectionFormValues,
  type ProductCollectionFormValues,
} from "./product-collection-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ProductCollection | null;
  onSave: (payload: { id?: string; values: ProductCollectionFormValues }) => Promise<string>;
};

export function ProductCollectionUpsertDialog({ open, onOpenChange, editing, onSave }: Props) {
  const resetKey = editing?.id ?? "new";
  const defaultValues: ProductCollectionFormValues = editing
    ? {
        name: editing.name,
      }
    : emptyProductCollectionFormValues();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit product collection" : "New product collection"}</DialogTitle>
        </DialogHeader>
        <ProductCollectionForm
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
