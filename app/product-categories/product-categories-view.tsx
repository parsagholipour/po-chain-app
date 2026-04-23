"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { ProductCategory } from "@/lib/types/api";
import { ProductCategoryUpsertDialog } from "@/components/po/product-categories/product-category-upsert-dialog";
import { ProductCategoriesTable } from "@/components/po/product-categories/product-categories-table";
import type { ProductCategoryFormValues } from "@/components/po/product-categories/product-category-form";
import { Button } from "@/components/ui/button";
import { TableContainer } from "@/components/ui/table-container";
import { TablePagination } from "@/components/ui/table-pagination";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";

const productCategoriesKey = ["product-categories"] as const;

export function ProductCategoriesView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductCategory | null>(null);

  const { data = [], isPending } = useQuery({
    queryKey: productCategoriesKey,
    queryFn: async () => {
      const { data: rows } = await api.get<ProductCategory[]>("/api/product-categories");
      return rows;
    },
  });
  const pagination = usePagination({ totalItems: data.length });
  const pagedRows = pagination.sliceItems(data);

  const createMut = useMutation({
    mutationFn: async (values: ProductCategoryFormValues) => {
      const { data: row } = await api.post<ProductCategory>("/api/product-categories", values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productCategoriesKey });
      toast.success("Product category created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: ProductCategoryFormValues }) => {
      const { data: row } = await api.patch<ProductCategory>(`/api/product-categories/${id}`, values);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productCategoriesKey });
      toast.success("Product category updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/product-categories/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productCategoriesKey });
      toast.success("Product category deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function handleSave(payload: { id?: string; values: ProductCategoryFormValues }): Promise<string> {
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
          <h1 className="text-2xl font-semibold tracking-tight">Product Categories</h1>
          <p className="text-sm text-muted-foreground">Manage product categories for your catalog.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add category
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
        <ProductCategoriesTable
          rows={pagedRows}
          isPending={isPending}
          onEdit={(row) => {
            setEditing(row);
            setOpen(true);
          }}
          onDelete={(row) => deleteMut.mutate(row.id)}
        />
      </TableContainer>

      <ProductCategoryUpsertDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}
