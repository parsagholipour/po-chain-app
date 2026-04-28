"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { ProductType } from "@/lib/types/api";
import { ProductTypeUpsertDialog } from "@/components/po/product-types/product-type-upsert-dialog";
import { ProductTypesTable } from "@/components/po/product-types/product-types-table";
import type { ProductTypeFormValues } from "@/components/po/product-types/product-type-form";
import { Button } from "@/components/ui/button";
import { TableContainer } from "@/components/ui/table-container";
import { TablePagination } from "@/components/ui/table-pagination";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";

const productTypesKey = ["product-types"] as const;

export function ProductTypesView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductType | null>(null);

  const { data = [], isPending } = useQuery({
    queryKey: productTypesKey,
    queryFn: async () => {
      const { data: rows } = await api.get<ProductType[]>("/api/product-types");
      return rows;
    },
  });
  const pagination = usePagination({ totalItems: data.length });
  const pagedRows = pagination.sliceItems(data);

  const createMut = useMutation({
    mutationFn: async (values: ProductTypeFormValues) => {
      const { data: row } = await api.post<ProductType>("/api/product-types", values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productTypesKey });
      toast.success("Product type created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ProductTypeFormValues }) => {
      const { data: row } = await api.patch<ProductType>(`/api/product-types/${id}`, values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productTypesKey });
      toast.success("Product type updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/product-types/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productTypesKey });
      toast.success("Product type deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function handleSave(payload: { id?: string; values: ProductTypeFormValues }): Promise<string> {
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
          <h1 className="text-2xl font-semibold tracking-tight">Product Types</h1>
          <p className="text-sm text-muted-foreground">Manage product types for your catalog.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add type
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
        <ProductTypesTable
          rows={pagedRows}
          isPending={isPending}
          onEdit={(row) => {
            setEditing(row);
            setOpen(true);
          }}
          onDelete={(row) => deleteMut.mutate(row.id)}
        />
      </TableContainer>

      <ProductTypeUpsertDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}
