"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { Manufacturer } from "@/lib/types/api";
import { ManufacturerUpsertDialog } from "@/components/po/manufacturers/manufacturer-upsert-dialog";
import { ManufacturersTable } from "@/components/po/manufacturers/manufacturers-table";
import type { ManufacturerFormValues } from "@/components/po/manufacturers/manufacturer-form";
import { Button } from "@/components/ui/button";
import { TableContainer } from "@/components/ui/table-container";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export type { Manufacturer } from "@/lib/types/api";

const manufacturersKey = ["manufacturers"] as const;

export function ManufacturersView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Manufacturer | null>(null);

  const { data = [], isPending } = useQuery({
    queryKey: manufacturersKey,
    queryFn: async () => {
      const { data: rows } = await api.get<Manufacturer[]>("/api/manufacturers");
      return rows;
    },
  });

  const createMut = useMutation({
    mutationFn: async (values: ManufacturerFormValues) => {
      const { data: row } = await api.post<Manufacturer>("/api/manufacturers", values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: manufacturersKey });
      toast.success("Manufacturer created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ManufacturerFormValues }) => {
      const { data: row } = await api.patch<Manufacturer>(`/api/manufacturers/${id}`, values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: manufacturersKey });
      toast.success("Manufacturer updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/manufacturers/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: manufacturersKey });
      toast.success("Manufacturer deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function handleSave(payload: { id?: string; values: ManufacturerFormValues }): Promise<string> {
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
          <h1 className="text-2xl font-semibold tracking-tight">Manufacturers</h1>
          <p className="text-sm text-muted-foreground">Manage manufacturer records and logos.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add manufacturer
        </Button>
      </div>

      <TableContainer>
        <ManufacturersTable
          rows={data}
          isPending={isPending}
          onEdit={(row) => {
            setEditing(row);
            setOpen(true);
          }}
          onDelete={(row) => deleteMut.mutate(row.id)}
        />
      </TableContainer>

      <ManufacturerUpsertDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}
