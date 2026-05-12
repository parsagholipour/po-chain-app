"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import type { SaleChannelProduct } from "@/lib/types/api";
import { SaleChannelProductsTable } from "@/components/po/products/sale-channel-products-table";
import { Button } from "@/components/ui/button";
import { ListFilters } from "@/components/ui/list-filters";
import { TableContainer } from "@/components/ui/table-container";
import { TablePagination } from "@/components/ui/table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import {
  LIST_FILTER_ALL_VALUE,
  normalizeListFilterText,
  useDebouncedValue,
  useListFilterState,
} from "@/hooks/use-list-filters";
import { productEditingStatusLabels } from "@/lib/product-editing-status";
import { cn } from "@/lib/utils";

const saleChannelProductsKey = ["sale-channel-products"] as const;
const uncollectedFilterValue = "__uncollected__";
const filterDefaults = {
  collection: LIST_FILTER_ALL_VALUE,
};

function searchHaystack(row: SaleChannelProduct) {
  return [
    row.sku,
    row.name,
    row.upcGtin,
    row.category?.name,
    row.collection?.name,
    row.imageLink,
    row.description,
    row.releaseDateShipsFrom,
    productEditingStatusLabels[row.editionStatus],
  ]
    .map((value) => normalizeListFilterText(value))
    .join(" ");
}

export function SaleChannelProductsView() {
  const productFilters = useListFilterState({ initialFilters: filterDefaults });
  const debouncedSearch = useDebouncedValue(productFilters.search);
  const [selectedCategoryIdState, setSelectedCategoryId] = useState<string | null>(null);

  const { data = [], isPending } = useQuery({
    queryKey: saleChannelProductsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<SaleChannelProduct[]>("/api/sale-channel/products");
      return rows;
    },
  });

  const collectionOptions = useMemo(() => {
    const options = new Map<string, string>();
    let hasUncollected = false;

    for (const product of data) {
      if (product.collection) {
        options.set(product.collection.id, product.collection.name);
      } else {
        hasUncollected = true;
      }
    }

    return [
      ...(hasUncollected ? [{ value: uncollectedFilterValue, label: "No collection" }] : []),
      ...Array.from(options, ([value, label]) => ({ value, label })).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    ];
  }, [data]);

  const categoryOptions = useMemo(() => {
    const options = new Map<string, { id: string; name: string; count: number }>();

    for (const product of data) {
      if (!product.category) continue;
      const current = options.get(product.category.id);
      options.set(product.category.id, {
        id: product.category.id,
        name: product.category.name,
        count: (current?.count ?? 0) + 1,
      });
    }

    return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const selectedCategoryId =
    categoryOptions.find((category) => category.id === selectedCategoryIdState)?.id ??
    categoryOptions[0]?.id ??
    null;

  const filteredRows = useMemo(() => {
    const q = normalizeListFilterText(debouncedSearch);
    const collectionFilter = productFilters.filters.collection;

    return data.filter((row) => {
      if (selectedCategoryId && row.category?.id !== selectedCategoryId) return false;
      if (q && !searchHaystack(row).includes(q)) return false;
      if (collectionFilter === LIST_FILTER_ALL_VALUE) return true;
      if (collectionFilter === uncollectedFilterValue) return row.collection === null;
      return row.collection?.id === collectionFilter;
    });
  }, [data, debouncedSearch, productFilters.filters.collection, selectedCategoryId]);

  const pagination = usePagination({
    totalItems: filteredRows.length,
    resetDeps: [debouncedSearch, productFilters.filters.collection, selectedCategoryId],
  });
  const pagedRows = pagination.sliceItems(filteredRows);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-sm text-muted-foreground">Browse catalog SKUs and release details.</p>
      </div>

      {categoryOptions.length > 0 ? (
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex w-max gap-2">
            {categoryOptions.map((category) => {
              const selected = category.id === selectedCategoryId;

              return (
                <Button
                  key={category.id}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  className={cn(
                    "h-9 shrink-0 gap-2 px-3",
                    !selected && "bg-background",
                  )}
                  onClick={() => setSelectedCategoryId(category.id)}
                >
                  <span className="max-w-[220px] truncate">{category.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      selected
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {category.count}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
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
              key: "collection",
              value: productFilters.filters.collection,
              onValueChange: (value) => productFilters.setFilter("collection", value),
              allLabel: "All collections",
              ariaLabel: "Filter by collection",
              placeholder: "Collection",
              options: collectionOptions,
              disabled: isPending || collectionOptions.length === 0,
            },
          ]}
          hasActiveFilters={productFilters.hasActiveFilters}
          onClear={productFilters.resetFilters}
          resultCount={filteredRows.length}
          totalCount={data.length}
        />
        <SaleChannelProductsTable
          rows={pagedRows}
          isPending={isPending}
          emptyMessage={
            productFilters.hasActiveFilters
              ? "No products match your filters."
              : "No products yet."
          }
        />
      </TableContainer>
    </div>
  );
}
