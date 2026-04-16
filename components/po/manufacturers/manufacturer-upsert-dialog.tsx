"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Manufacturer } from "@/lib/types/api";
import {
  ManufacturerForm,
  emptyManufacturerFormValues,
  type ManufacturerFormValues,
} from "./manufacturer-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Manufacturer | null;
  onSave: (payload: { id?: string; values: ManufacturerFormValues }) => Promise<string>;
};

export function ManufacturerUpsertDialog({ open, onOpenChange, editing, onSave }: Props) {
  const resetKey = editing?.id ?? "new";
  const defaultValues: ManufacturerFormValues = editing
    ? {
        name: editing.name,
        region: editing.region,
        logoKey: editing.logoKey,
        contactNumber: editing.contactNumber ?? "",
        address: editing.address ?? "",
        email: editing.email ?? "",
        link: editing.link ?? "",
        notes: editing.notes ?? "",
      }
    : emptyManufacturerFormValues();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit manufacturer" : "New manufacturer"}</DialogTitle>
        </DialogHeader>
        <ManufacturerForm
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
