"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Edit3, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-provider";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { SaleChannel, SaleChannelLocation } from "@/lib/types/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  emptySaleChannelLocationValues,
  SaleChannelLocationForm,
  saleChannelLocationValuesFromLocation,
  type SaleChannelLocationFormValues,
} from "@/components/po/sale-channels/sale-channel-location-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleChannel: SaleChannel | null;
};

function compactAddress(location: SaleChannelLocation) {
  return [
    location.addressLine1,
    location.addressLine2,
    location.city,
    location.stateProvince,
    location.postalCode,
    location.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function SaleChannelLocationsDialog({ open, onOpenChange, saleChannel }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<SaleChannelLocation | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const locationsKey = ["sale-channel-locations", saleChannel?.id] as const;

  const { data: locations = [], isPending } = useQuery({
    queryKey: locationsKey,
    enabled: open && !!saleChannel,
    queryFn: async () => {
      const { data } = await api.get<SaleChannelLocation[]>(
        `/api/sale-channels/${saleChannel!.id}/locations`,
      );
      return data;
    },
  });

  const createMut = useMutation({
    mutationFn: async (values: SaleChannelLocationFormValues) => {
      if (!saleChannel) throw new Error("No sale channel selected");
      const { data } = await api.post<SaleChannelLocation>(
        `/api/sale-channels/${saleChannel.id}/locations`,
        values,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationsKey });
      toast.success("Location created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: SaleChannelLocationFormValues }) => {
      if (!saleChannel) throw new Error("No sale channel selected");
      const { data } = await api.patch<SaleChannelLocation>(
        `/api/sale-channels/${saleChannel.id}/locations/${id}`,
        values,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationsKey });
      toast.success("Location updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      if (!saleChannel) throw new Error("No sale channel selected");
      await api.delete(`/api/sale-channels/${saleChannel.id}/locations/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: locationsKey });
      toast.success("Location deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  if (!saleChannel) return null;

  const formValues = editing
    ? saleChannelLocationValuesFromLocation(editing)
    : emptySaleChannelLocationValues();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setEditing(null);
          setFormOpen(false);
        }
      }}
    >
      <DialogContent size="4xl">
        <DialogHeader>
          <DialogTitle>{saleChannel.name} locations</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Add location
            </Button>
          </div>

          {formOpen ? (
            <div className="rounded-lg border border-border/80 p-4">
              <SaleChannelLocationForm
                key={editing?.id ?? "new"}
                defaultValues={formValues}
                onCancel={() => {
                  setEditing(null);
                  setFormOpen(false);
                }}
                onSubmit={async (values) => {
                  if (editing) {
                    await updateMut.mutateAsync({ id: editing.id, values });
                  } else {
                    await createMut.mutateAsync(values);
                  }
                  setEditing(null);
                  setFormOpen(false);
                }}
              />
            </div>
          ) : null}

          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="max-w-[140px]">Phone</TableHead>
                  <TableHead className="w-[112px] text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : locations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No locations yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  locations.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell className="font-medium">{location.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {location.recipientName}
                      </TableCell>
                      <TableCell className="max-w-[360px] truncate text-muted-foreground" title={compactAddress(location)}>
                        {compactAddress(location)}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-muted-foreground">
                        {location.phoneNumber || "-"}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Edit location"
                            onClick={() => {
                              setEditing(location);
                              setFormOpen(true);
                            }}
                          >
                            <Edit3 className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            aria-label="Delete location"
                            onClick={() => {
                              void (async () => {
                                const ok = await confirm({
                                  title: `Delete "${location.name}"?`,
                                  confirmLabel: "Delete",
                                  variant: "destructive",
                                });
                                if (ok) deleteMut.mutate(location.id);
                              })();
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
