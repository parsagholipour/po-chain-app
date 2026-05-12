"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SaleChannelLocation } from "@/lib/types/api";
import {
  emptySaleChannelLocationValues,
  SaleChannelLocationForm,
  saleChannelLocationValuesFromLocation,
  type SaleChannelLocationFormValues,
} from "@/components/po/sale-channels/sale-channel-location-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: SaleChannelLocation | null;
  onSave: (payload: { id?: string; values: SaleChannelLocationFormValues }) => Promise<string>;
};

export function SaleChannelLocationUpsertDialog({
  open,
  onOpenChange,
  editing,
  onSave,
}: Props) {
  const resetKey = editing?.id ?? "new";
  const defaultValues = editing
    ? saleChannelLocationValuesFromLocation(editing)
    : emptySaleChannelLocationValues();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="4xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit location" : "New location"}</DialogTitle>
        </DialogHeader>
        <SaleChannelLocationForm
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
