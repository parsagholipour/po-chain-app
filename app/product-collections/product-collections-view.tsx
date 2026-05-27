"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { ProductCollection } from "@/lib/types/api";
import { ProductCollectionUpsertDialog } from "@/components/po/product-collections/product-collection-upsert-dialog";
import { ProductCollectionsTable } from "@/components/po/product-collections/product-collections-table";
import type { ProductCollectionFormValues } from "@/components/po/product-collections/product-collection-form";
import { Button } from "@/components/ui/button";
import { TableContainer } from "@/components/ui/table-container";
import { TablePagination } from "@/components/ui/table-pagination";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";

const productCollectionsKey = ["product-collections"] as const;

export function ProductCollectionsView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductCollection | null>(null);

  const { data = [], isPending } = useQuery({
    queryKey: productCollectionsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<ProductCollection[]>("/api/product-collections");
      return rows;
    },
  });
  const pagination = usePagination({ totalItems: data.length });
  const pagedRows = pagination.sliceItems(data);
  const isTablePending = isPending && data.length === 0;

  const createMut = useMutation({
    mutationFn: async (values: ProductCollectionFormValues) => {
      const { data: row } = await api.post<ProductCollection>("/api/product-collections", values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productCollectionsKey });
      toast.success("Product collection created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ProductCollectionFormValues }) => {
      const { data: row } = await api.patch<ProductCollection>(`/api/product-collections/${id}`, values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productCollectionsKey });
      toast.success("Product collection updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/product-collections/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productCollectionsKey });
      toast.success("Product collection deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function handleSave(payload: { id?: string; values: ProductCollectionFormValues }): Promise<string> {
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
          <h1 className="text-2xl font-semibold tracking-tight">Product Collections</h1>
          <p className="text-sm text-muted-foreground">Manage product collections for your catalog.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add collection
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
        <ProductCollectionsTable
          rows={pagedRows}
          isPending={isTablePending}
          onEdit={(row) => {
            setEditing(row);
            setOpen(true);
          }}
          onDelete={(row) => deleteMut.mutate(row.id)}
        />
      </TableContainer>

      <ProductCollectionUpsertDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}
