"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Warehouse } from "@/lib/types/api";
import {
  WarehouseForm,
  emptyWarehouseFormValues,
  type WarehouseFormValues,
} from "./warehouse-form";
import type { SaleChannel } from "@/lib/types/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Warehouse | null;
  saleChannels: SaleChannel[];
  saleChannelsPending?: boolean;
  onSave: (payload: { id?: string; values: WarehouseFormValues }) => Promise<string>;
};

export function WarehouseUpsertDialog({
  open,
  onOpenChange,
  editing,
  saleChannels,
  saleChannelsPending = false,
  onSave,
}: Props) {
  const resetKey = editing?.id ?? "new";
  const defaultValues: WarehouseFormValues = editing
    ? {
        name: editing.name,
        address: editing.address ?? "",
        phoneNumber: editing.phoneNumber ?? "",
        email: editing.email ?? "",
        saleChannelId: editing.saleChannelId,
      }
    : emptyWarehouseFormValues();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit warehouse" : "New warehouse"}</DialogTitle>
        </DialogHeader>
        <WarehouseForm
          key={open ? resetKey : "idle"}
          defaultValues={defaultValues}
          saleChannels={saleChannels}
          saleChannelsPending={saleChannelsPending}
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
