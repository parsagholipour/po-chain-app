"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { SaleChannel, Warehouse } from "@/lib/types/api";
import { parseUuidParam, useClearIdSearchParam } from "@/lib/url-id-param";
import { usePagination } from "@/hooks/use-pagination";
import { Button } from "@/components/ui/button";
import { TableContainer } from "@/components/ui/table-container";
import { TablePagination } from "@/components/ui/table-pagination";
import { WarehouseUpsertDialog } from "@/components/po/warehouses/warehouse-upsert-dialog";
import type { WarehouseFormValues } from "@/components/po/warehouses/warehouse-form";
import { WarehousesTable } from "@/components/po/warehouses/warehouses-table";

export type { Warehouse } from "@/lib/types/api";

const warehousesKey = ["warehouses"] as const;
const saleChannelsKey = ["sale-channels"] as const;

export function WarehousesView() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const clearIdParam = useClearIdSearchParam();
  const idFromUrl = parseUuidParam(searchParams.get("id"));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);

  const { data = [], isPending } = useQuery({
    queryKey: warehousesKey,
    queryFn: async () => {
      const { data: rows } = await api.get<Warehouse[]>("/api/warehouses");
      return rows;
    },
  });
  const { data: saleChannels = [], isPending: saleChannelsPending } = useQuery({
    queryKey: saleChannelsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<SaleChannel[]>("/api/sale-channels");
      return rows;
    },
  });

  const pagination = usePagination({ totalItems: data.length });
  const pagedRows = pagination.sliceItems(data);
  const isTablePending = isPending && data.length === 0;

  useEffect(() => {
    if (!idFromUrl || isPending) return;
    const row = data.find((r) => r.id === idFromUrl);
    queueMicrotask(() => {
      if (row) {
        setEditing(row);
        setOpen(true);
      } else {
        toast.error("Warehouse not found");
        clearIdParam();
      }
    });
  }, [idFromUrl, isPending, data, clearIdParam]);

  const createMut = useMutation({
    mutationFn: async (values: WarehouseFormValues) => {
      const { data: row } = await api.post<Warehouse>("/api/warehouses", values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: warehousesKey });
      toast.success("Warehouse created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: WarehouseFormValues }) => {
      const { data: row } = await api.patch<Warehouse>(`/api/warehouses/${id}`, values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: warehousesKey });
      qc.invalidateQueries({ queryKey: ["warehouse-orders"] });
      qc.invalidateQueries({ queryKey: ["warehouse-order"] });
      toast.success("Warehouse updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/warehouses/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: warehousesKey });
      toast.success("Warehouse deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function handleSave(payload: { id?: string; values: WarehouseFormValues }) {
    if (payload.id) {
      await updateMut.mutateAsync({ id: payload.id, values: payload.values });
      return payload.id;
    }
    const row = await createMut.mutateAsync(payload.values);
    return row.id;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Warehouses</h1>
          <p className="text-sm text-muted-foreground">
            Manage warehouse contact records for warehouse order fulfillment.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add warehouse
        </Button>
      </div>

      <TableContainer
        footer={
          <TablePagination
            {...pagination}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        }
      >
        <WarehousesTable
          rows={pagedRows}
          isPending={isTablePending}
          onEdit={(row) => {
            setEditing(row);
            setOpen(true);
          }}
          onDelete={(row) => deleteMut.mutate(row.id)}
        />
      </TableContainer>

      <WarehouseUpsertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            clearIdParam();
            setEditing(null);
          }
        }}
        editing={editing}
        saleChannels={saleChannels}
        saleChannelsPending={saleChannelsPending}
        onSave={handleSave}
      />
    </div>
  );
}
