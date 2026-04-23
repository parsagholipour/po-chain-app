"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SaleChannel } from "@/lib/types/api";
import {
  SaleChannelForm,
  emptySaleChannelFormValues,
  type SaleChannelFormValues,
} from "./sale-channel-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: SaleChannel | null;
  onSave: (payload: { id?: string; values: SaleChannelFormValues }) => Promise<string>;
};

export function SaleChannelUpsertDialog({ open, onOpenChange, editing, onSave }: Props) {
  const resetKey = editing?.id ?? "new";
  const defaultValues: SaleChannelFormValues = editing
    ? {
        name: editing.name,
        type: editing.type,
        logoKey: editing.logoKey,
        contactNumber: editing.contactNumber ?? "",
        address: editing.address ?? "",
        email: editing.email ?? "",
        link: editing.link ?? "",
        notes: editing.notes ?? "",
      }
    : emptySaleChannelFormValues();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit sale channel" : "New sale channel"}</DialogTitle>
        </DialogHeader>
        <SaleChannelForm
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
