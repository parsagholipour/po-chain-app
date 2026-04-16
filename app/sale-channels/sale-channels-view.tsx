"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { SaleChannel } from "@/lib/types/api";
import { SaleChannelUpsertDialog } from "@/components/po/sale-channels/sale-channel-upsert-dialog";
import { SaleChannelsTable } from "@/components/po/sale-channels/sale-channels-table";
import type { SaleChannelFormValues } from "@/components/po/sale-channels/sale-channel-form";
import { Button } from "@/components/ui/button";
import { TableContainer } from "@/components/ui/table-container";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export type { SaleChannel } from "@/lib/types/api";

const saleChannelsKey = ["sale-channels"] as const;

export function SaleChannelsView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SaleChannel | null>(null);

  const { data = [], isPending } = useQuery({
    queryKey: saleChannelsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<SaleChannel[]>("/api/sale-channels");
      return rows;
    },
  });

  const createMut = useMutation({
    mutationFn: async (values: SaleChannelFormValues) => {
      const { data: row } = await api.post<SaleChannel>("/api/sale-channels", values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleChannelsKey });
      toast.success("Sale channel created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: SaleChannelFormValues }) => {
      const { data: row } = await api.patch<SaleChannel>(`/api/sale-channels/${id}`, values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleChannelsKey });
      toast.success("Sale channel updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/sale-channels/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: saleChannelsKey });
      toast.success("Sale channel deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function handleSave(payload: { id?: string; values: SaleChannelFormValues }): Promise<string> {
    if (payload.id) {
      await updateMut.mutateAsync({ id: payload.id, values: payload.values });
      return payload.id;
    } else {
      const row = await createMut.mutateAsync(payload.values);
      return row.id;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sale channels</h1>
          <p className="text-sm text-muted-foreground">Where orders are sold or fulfilled.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add sale channel
        </Button>
      </div>

      <TableContainer>
        <SaleChannelsTable
          rows={data}
          isPending={isPending}
          onEdit={(row) => {
            setEditing(row);
            setOpen(true);
          }}
          onDelete={(row) => deleteMut.mutate(row.id)}
        />
      </TableContainer>

      <SaleChannelUpsertDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}
