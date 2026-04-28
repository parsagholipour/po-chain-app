"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { Manufacturer, Product, ProductCategory, ProductType } from "@/lib/types/api";
import { ProductUpsertDialog } from "@/components/po/products/product-upsert-dialog";
import { ProductsTable } from "@/components/po/products/products-table";
import type { ProductFormValues } from "@/components/po/products/product-form";
import { Button } from "@/components/ui/button";
import { ListFilters } from "@/components/ui/list-filters";
import { TableContainer } from "@/components/ui/table-container";
import { TablePagination } from "@/components/ui/table-pagination";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { parseUuidParam, useClearIdSearchParam } from "@/lib/url-id-param";
import { usePagination } from "@/hooks/use-pagination";
import {
  LIST_FILTER_ALL_VALUE,
  useDebouncedValue,
  useListFilterState,
} from "@/hooks/use-list-filters";

export type { Product } from "@/lib/types/api";

const productsKey = ["products"] as const;
const manufacturersKey = ["manufacturers"] as const;
const productCategoriesKey = ["product-categories"] as const;
const productTypesKey = ["product-types"] as const;
const uncategorizedFilterValue = "__uncategorized__";
const untypedFilterValue = "__untyped__";
const productFilterDefaults: Record<"category" | "type", string> = {
  category: LIST_FILTER_ALL_VALUE,
  type: LIST_FILTER_ALL_VALUE,
};

export function ProductsView() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const clearIdParam = useClearIdSearchParam();
  const idFromUrl = parseUuidParam(searchParams.get("id"));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const productFilters = useListFilterState({
    initialFilters: productFilterDefaults,
  });
  const debouncedSearch = useDebouncedValue(productFilters.search);

  const { data: manufacturers = [], isPending: manufacturersPending } = useQuery({
    queryKey: manufacturersKey,
    queryFn: async () => {
      const { data: rows } = await api.get<Manufacturer[]>("/api/manufacturers");
      return rows;
    },
  });

  const { data = [], isPending } = useQuery({
    queryKey: [
      ...productsKey,
      debouncedSearch,
      productFilters.filters.category,
      productFilters.filters.type,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      const q = debouncedSearch.trim();
      if (q) params.set("q", q);
      if (productFilters.filters.category !== LIST_FILTER_ALL_VALUE) {
        params.set(
          "categoryId",
          productFilters.filters.category === uncategorizedFilterValue
            ? "none"
            : productFilters.filters.category,
        );
      }
      if (productFilters.filters.type !== LIST_FILTER_ALL_VALUE) {
        params.set(
          "typeId",
          productFilters.filters.type === untypedFilterValue
            ? "none"
            : productFilters.filters.type,
        );
      }
      const qs = params.toString();
      const { data: rows } = await api.get<Product[]>(`/api/products${qs ? `?${qs}` : ""}`);
      return rows;
    },
  });

  const { data: categories = [], isPending: categoriesPending } = useQuery({
    queryKey: productCategoriesKey,
    queryFn: async () => {
      const { data: rows } = await api.get<ProductCategory[]>("/api/product-categories");
      return rows;
    },
  });

  const { data: productTypes = [], isPending: productTypesPending } = useQuery({
    queryKey: productTypesKey,
    queryFn: async () => {
      const { data: rows } = await api.get<ProductType[]>("/api/product-types");
      return rows;
    },
  });

  const categoryFilterOptions = useMemo(
    () => [
      { value: uncategorizedFilterValue, label: "No category" },
      ...categories.map((category) => ({ value: category.id, label: category.name })),
    ],
    [categories],
  );

  const typeFilterOptions = useMemo(
    () => [
      { value: untypedFilterValue, label: "No type" },
      ...productTypes.map((type) => ({ value: type.id, label: type.name })),
    ],
    [productTypes],
  );

  const pagination = usePagination({
    totalItems: data.length,
    resetDeps: [debouncedSearch, productFilters.filters.category, productFilters.filters.type],
  });
  const pagedRows = pagination.sliceItems(data);

  useEffect(() => {
    if (!idFromUrl || isPending) return;
    const row = data.find((r) => r.id === idFromUrl);
    queueMicrotask(() => {
      if (row) {
        setEditing(row);
        setOpen(true);
      } else {
        toast.error("Product not found");
        clearIdParam();
      }
    });
  }, [idFromUrl, isPending, data, clearIdParam]);

  const createMut = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const { data: row } = await api.post<Product>("/api/products", {
        name: values.name,
        sku: values.sku,
        cost: values.cost ?? null,
        price: values.price ?? null,
        defaultManufacturerId: values.defaultManufacturerId,
        categoryId: values.categoryId,
        typeId: values.typeId,
        verified: values.verified,
        imageKey: values.imageKey,
        barcodeKey: values.barcodeKey,
        packagingKey: values.packagingKey,
      });
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKey });
      toast.success("Product created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const { data: row } = await api.patch<Product>(`/api/products/${id}`, body);
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKey });
      toast.success("Product updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/products/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKey });
      toast.success("Product deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function handleSave(payload: {
    id?: string;
    values: ProductFormValues;
    patchImageKey: boolean;
    patchBarcodeKey: boolean;
    patchPackagingKey: boolean;
  }): Promise<string> {
    if (payload.id) {
      const body: Record<string, unknown> = {
        name: payload.values.name,
        sku: payload.values.sku,
        cost: payload.values.cost ?? null,
        price: payload.values.price ?? null,
        defaultManufacturerId: payload.values.defaultManufacturerId,
        categoryId: payload.values.categoryId,
        typeId: payload.values.typeId,
        verified: payload.values.verified,
      };
      if (payload.patchImageKey) {
        body.imageKey = payload.values.imageKey;
      }
      if (payload.patchBarcodeKey) {
        body.barcodeKey = payload.values.barcodeKey;
      }
      if (payload.patchPackagingKey) {
        body.packagingKey = payload.values.packagingKey;
      }
      await updateMut.mutateAsync({ id: payload.id, body });
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
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Catalog SKUs and default manufacturers.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          disabled={manufacturersPending || manufacturers.length === 0}
        >
          <Plus className="size-4" />
          Add product
        </Button>
      </div>
      {!manufacturersPending && manufacturers.length === 0 ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Create at least one manufacturer before adding products.
        </p>
      ) : null}

      <TableContainer
        footer={
          <TablePagination
            {...pagination}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        }
      >
        <ListFilters
          className="border-b border-border/80 bg-muted/20"
          searchValue={productFilters.search}
          onSearchChange={productFilters.setSearch}
          searchAriaLabel="Search products"
          searchPlaceholder="Search products..."
          selects={[
            {
              key: "category",
              value: productFilters.filters.category,
              onValueChange: (value) => productFilters.setFilter("category", value),
              allLabel: "All categories",
              ariaLabel: "Filter by category",
              placeholder: "Category",
              options: categoryFilterOptions,
              disabled: categoriesPending,
            },
            {
              key: "type",
              value: productFilters.filters.type,
              onValueChange: (value) => productFilters.setFilter("type", value),
              allLabel: "All types",
              ariaLabel: "Filter by type",
              placeholder: "Type",
              options: typeFilterOptions,
              disabled: productTypesPending,
            },
          ]}
          hasActiveFilters={productFilters.hasActiveFilters}
          onClear={productFilters.resetFilters}
          resultCount={data.length}
          totalCount={data.length}
        />
        <ProductsTable
          rows={pagedRows}
          isPending={isPending}
          emptyMessage={
            productFilters.hasActiveFilters
              ? "No products match your filters."
              : "No products yet."
          }
          onEdit={(row) => {
            setEditing(row);
            setOpen(true);
          }}
          onDelete={(row) => deleteMut.mutate(row.id)}
        />
      </TableContainer>

      <ProductUpsertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            clearIdParam();
            setEditing(null);
          }
        }}
        editing={editing}
        manufacturers={manufacturers}
        onSave={handleSave}
      />
    </div>
  );
}
