"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Manufacturer } from "@/lib/types/api";
import { ManufacturerForm, type ManufacturerFormValues } from "./manufacturer-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Manufacturer | null;
  onSave: (payload: { id?: string; values: ManufacturerFormValues }) => Promise<void>;
};

export function ManufacturerUpsertDialog({ open, onOpenChange, editing, onSave }: Props) {
  const resetKey = editing?.id ?? "new";
  const defaultValues: ManufacturerFormValues = editing
    ? { name: editing.name, region: editing.region, logoKey: editing.logoKey }
    : { name: "", region: "", logoKey: null };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit manufacturer" : "New manufacturer"}</DialogTitle>
        </DialogHeader>
        <ManufacturerForm
          key={open ? resetKey : "idle"}
          defaultValues={defaultValues}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (values) => {
            await onSave({ id: editing?.id, values });
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
