"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type {
  Manufacturer,
  PaginatedResponse,
  Product,
  ProductCategory,
  ProductCollection,
  ProductType,
} from "@/lib/types/api";
import { ProductUpsertDialog } from "@/components/po/products/product-upsert-dialog";
import { ProductsTable } from "@/components/po/products/products-table";
import type { ProductFormValues } from "@/components/po/products/product-form";
import { productFormValuesToApiBody } from "@/components/po/products/product-payload";
import { Button } from "@/components/ui/button";
import { ListFilters } from "@/components/ui/list-filters";
import { TableContainer } from "@/components/ui/table-container";
import { TablePagination } from "@/components/ui/table-pagination";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { parseUuidParam, useClearIdSearchParam } from "@/lib/url-id-param";
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
const productCollectionsKey = ["product-collections"] as const;
const defaultPage = 1;
const defaultPageSize = 25;
const uncategorizedFilterValue = "__uncategorized__";
const untypedFilterValue = "__untyped__";
const uncollectedFilterValue = "__uncollected__";
type ProductFilterKey = "category" | "type" | "collection";
type ProductFilters = Record<ProductFilterKey, string>;
type ProductPageResponse = PaginatedResponse<Product>;

const productFilterDefaults: ProductFilters = {
  category: LIST_FILTER_ALL_VALUE,
  type: LIST_FILTER_ALL_VALUE,
  collection: LIST_FILTER_ALL_VALUE,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildProductSearchParams({
  search,
  filters,
  page,
  pageSize,
}: {
  search: string;
  filters: ProductFilters;
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams();
  const q = search.trim();
  if (q) params.set("q", q);
  if (filters.category !== LIST_FILTER_ALL_VALUE) {
    params.set(
      "categoryId",
      filters.category === uncategorizedFilterValue ? "none" : filters.category,
    );
  }
  if (filters.type !== LIST_FILTER_ALL_VALUE) {
    params.set("typeId", filters.type === untypedFilterValue ? "none" : filters.type);
  }
  if (filters.collection !== LIST_FILTER_ALL_VALUE) {
    params.set(
      "collectionId",
      filters.collection === uncollectedFilterValue ? "none" : filters.collection,
    );
  }
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return params;
}

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
  const [page, setPageState] = useState(defaultPage);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  const { data: manufacturers = [], isPending: manufacturersPending } = useQuery({
    queryKey: manufacturersKey,
    queryFn: async () => {
      const { data: rows } = await api.get<Manufacturer[]>("/api/manufacturers");
      return rows;
    },
  });

  const {
    data: productPage,
    isPending,
    isFetching,
  } = useQuery({
    queryKey: [
      ...productsKey,
      debouncedSearch,
      productFilters.filters.category,
      productFilters.filters.type,
      productFilters.filters.collection,
      page,
      pageSize,
    ],
    queryFn: async () => {
      const params = buildProductSearchParams({
        search: debouncedSearch,
        filters: productFilters.filters,
        page,
        pageSize,
      });
      const qs = params.toString();
      const { data } = await api.get<ProductPageResponse>(`/api/products?${qs}`);
      return data;
    },
    placeholderData: keepPreviousData,
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

  const { data: productCollections = [], isPending: productCollectionsPending } = useQuery({
    queryKey: productCollectionsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<ProductCollection[]>("/api/product-collections");
      return rows;
    },
  });

  const selectedProductQuery = useQuery({
    queryKey: [...productsKey, "detail", idFromUrl],
    queryFn: async () => {
      if (!idFromUrl) throw new Error("Missing product id");
      const { data: row } = await api.get<Product>(`/api/products/${idFromUrl}`);
      return row;
    },
    enabled: Boolean(idFromUrl),
    retry: false,
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

  const collectionFilterOptions = useMemo(
    () => [
      { value: uncollectedFilterValue, label: "No collection" },
      ...productCollections.map((collection) => ({ value: collection.id, label: collection.name })),
    ],
    [productCollections],
  );

  const rows = productPage?.rows ?? [];
  const totalItems = productPage?.total ?? 0;
  const pageCount = Math.max(Math.ceil(totalItems / pageSize), 1);
  const safePage = clamp(page, 1, pageCount);
  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = totalItems === 0 ? 0 : Math.min(startIndex + pageSize, totalItems);
  const isTablePending = isPending || isFetching;

  useEffect(() => {
    if (page === safePage) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageState(safePage);
  }, [page, safePage]);

  const setPage = useCallback(
    (next: number) => {
      setPageState(clamp(next, 1, pageCount));
    },
    [pageCount],
  );

  const setPageSize = useCallback((next: number) => {
    setPageSizeState(Math.max(next, 1));
    setPageState(defaultPage);
  }, []);

  const resetPage = useCallback(() => {
    setPageState(defaultPage);
  }, []);

  const pagination = useMemo(
    () => ({
      page: safePage,
      pageSize,
      pageCount,
      totalItems,
      startIndex,
      endIndex,
      setPage,
      setPageSize,
    }),
    [endIndex, pageCount, pageSize, safePage, setPage, setPageSize, startIndex, totalItems],
  );

  useEffect(() => {
    if (!idFromUrl) return;
    if (selectedProductQuery.data) {
      queueMicrotask(() => {
        setEditing(selectedProductQuery.data ?? null);
        setOpen(true);
      });
      return;
    }
    if (!selectedProductQuery.isError) return;
    queueMicrotask(() => {
      toast.error("Product not found");
      clearIdParam();
    });
  }, [idFromUrl, selectedProductQuery.data, selectedProductQuery.isError, clearIdParam]);

  const createMut = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const { data: row } = await api.post<Product>(
        "/api/products",
        productFormValuesToApiBody(values),
      );
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
      const body = productFormValuesToApiBody(payload.values, {
        includeImageKey: payload.patchImageKey,
        includeBarcodeKey: payload.patchBarcodeKey,
        includePackagingKey: payload.patchPackagingKey,
      });
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
          onSearchChange={(value) => {
            productFilters.setSearch(value);
            resetPage();
          }}
          searchAriaLabel="Search products"
          searchPlaceholder="Search products..."
          selects={[
            {
              key: "category",
              value: productFilters.filters.category,
              onValueChange: (value) => {
                productFilters.setFilter("category", value);
                resetPage();
              },
              allLabel: "All categories",
              ariaLabel: "Filter by category",
              placeholder: "Category",
              options: categoryFilterOptions,
              disabled: categoriesPending,
            },
            {
              key: "type",
              value: productFilters.filters.type,
              onValueChange: (value) => {
                productFilters.setFilter("type", value);
                resetPage();
              },
              allLabel: "All types",
              ariaLabel: "Filter by type",
              placeholder: "Type",
              options: typeFilterOptions,
              disabled: productTypesPending,
            },
            {
              key: "collection",
              value: productFilters.filters.collection,
              onValueChange: (value) => {
                productFilters.setFilter("collection", value);
                resetPage();
              },
              allLabel: "All collections",
              ariaLabel: "Filter by collection",
              placeholder: "Collection",
              options: collectionFilterOptions,
              disabled: productCollectionsPending,
            },
          ]}
          hasActiveFilters={productFilters.hasActiveFilters}
          onClear={() => {
            productFilters.resetFilters();
            resetPage();
          }}
          resultCount={totalItems}
          totalCount={totalItems}
        />
        <ProductsTable
          rows={rows}
          isPending={isTablePending}
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
