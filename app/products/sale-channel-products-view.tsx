"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { api } from "@/lib/axios";
import type { SaleChannelProduct } from "@/lib/types/api";
import { SaleChannelProductsTable } from "@/components/po/products/sale-channel-products-table";
import { Button } from "@/components/ui/button";
import { ListFilters } from "@/components/ui/list-filters";
import { TableContainer } from "@/components/ui/table-container";
import { TablePagination } from "@/components/ui/table-pagination";
import { useClientReady } from "@/hooks/use-client-ready";
import { usePagination } from "@/hooks/use-pagination";
import {
  LIST_FILTER_ALL_VALUE,
  normalizeListFilterText,
  useDebouncedValue,
  useListFilterState,
} from "@/hooks/use-list-filters";
import { productEditingStatusLabels } from "@/lib/product-editing-status";
import { storageDownloadUrl } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

const saleChannelProductsKey = ["sale-channel-products"] as const;
const uncollectedFilterValue = "__uncollected__";
const filterDefaults = {
  collection: LIST_FILTER_ALL_VALUE,
};
const noCategorySheetName = "No category";

type WorkbookCellValue = string | number | null | undefined;

type SaleChannelProductExportColumn = {
  label: string;
  value: (row: SaleChannelProduct) => WorkbookCellValue;
  width: number;
};

function numericExportValue(value: string | number | null | undefined): WorkbookCellValue {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : String(value);
}

function formatExportDate(value: string | null): string | null {
  if (!value) return null;
  const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (dateOnly) return dateOnly;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function stockStatusLabel(stockCount: number | null) {
  if (stockCount == null) return "Unknown";
  return stockCount > 0 ? "In stock" : "Out of stock";
}

function absoluteAppUrl(path: string) {
  return new URL(path, window.location.origin).toString();
}

function barcodeDownloadUrl(row: SaleChannelProduct) {
  if (!row.barcodeKey) return null;
  return absoluteAppUrl(storageDownloadUrl(row.barcodeKey));
}

const saleChannelProductExportColumns: SaleChannelProductExportColumn[] = [
  { label: "SKU", value: (row) => row.sku, width: 120 },
  { label: "Product Name", value: (row) => row.name, width: 260 },
  { label: "UPC/GTIN", value: (row) => row.upcGtin, width: 140 },
  { label: "Product Category", value: (row) => row.category?.name, width: 160 },
  { label: "Collection", value: (row) => row.collection?.name, width: 160 },
  { label: "MSRP", value: (row) => numericExportValue(row.msrp), width: 90 },
  { label: "MAP", value: (row) => numericExportValue(row.map), width: 90 },
  {
    label: "Wholesale Price",
    value: (row) => numericExportValue(row.wholesalePrice),
    width: 110,
  },
  { label: "MOQ", value: (row) => numericExportValue(row.moq), width: 70 },
  { label: "Image Link", value: (row) => row.imageLink, width: 260 },
  { label: "Barcode Image", value: barcodeDownloadUrl, width: 260 },
  { label: "Stock Status", value: (row) => stockStatusLabel(row.stockCount), width: 110 },
  { label: "Stock Count", value: (row) => numericExportValue(row.stockCount), width: 90 },
  {
    label: "Qty/Carton",
    value: (row) => numericExportValue(row.quantityPerCarton),
    width: 90,
  },
  { label: "Description", value: (row) => row.description, width: 360 },
  { label: "Order By Date", value: (row) => formatExportDate(row.orderByDate), width: 110 },
  {
    label: "Release Date (Ships From)",
    value: (row) => formatExportDate(row.releaseDateShipsFrom),
    width: 170,
  },
  {
    label: "Edition Status",
    value: (row) => productEditingStatusLabels[row.editionStatus],
    width: 120,
  },
];

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "\"":
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

function sanitizeSheetName(value: string) {
  const cleaned = value
    .trim()
    .replace(/[\[\]:*?/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^'+|'+$/g, "");

  return cleaned.length > 0 ? cleaned : noCategorySheetName;
}

function uniqueSheetName(value: string, usedSheetNames: Set<string>) {
  const baseName = sanitizeSheetName(value).slice(0, 31).trim() || noCategorySheetName;
  let candidate = baseName;
  let suffix = 2;

  while (usedSheetNames.has(candidate.toLowerCase())) {
    const suffixText = ` ${suffix}`;
    candidate = `${baseName.slice(0, 31 - suffixText.length).trim()}${suffixText}`;
    suffix += 1;
  }

  usedSheetNames.add(candidate.toLowerCase());
  return candidate;
}

function workbookCell(value: WorkbookCellValue, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";

  if (value == null || value === "") {
    return `<Cell${style}/>`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell${style}><Data ss:Type="Number">${value}</Data></Cell>`;
  }

  return `<Cell${style}><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`;
}

function workbookRow(values: WorkbookCellValue[], styleId?: string) {
  return `<Row>${values.map((value) => workbookCell(value, styleId)).join("")}</Row>`;
}

function categoryProductGroups(rows: SaleChannelProduct[]) {
  const groups = new Map<string, { name: string; rows: SaleChannelProduct[] }>();

  for (const row of rows) {
    const key = row.category?.id ?? noCategorySheetName;
    const current = groups.get(key);

    if (current) {
      current.rows.push(row);
    } else {
      groups.set(key, {
        name: row.category?.name ?? noCategorySheetName,
        rows: [row],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.name === noCategorySheetName) return 1;
    if (b.name === noCategorySheetName) return -1;
    return a.name.localeCompare(b.name);
  });
}

function buildSaleChannelProductsWorkbook(rows: SaleChannelProduct[]) {
  const usedSheetNames = new Set<string>();
  const columns = saleChannelProductExportColumns
    .map((column) => `<Column ss:AutoFitWidth="0" ss:Width="${column.width}"/>`)
    .join("");
  const headerRow = workbookRow(
    saleChannelProductExportColumns.map((column) => column.label),
    "Header",
  );
  const worksheets = categoryProductGroups(rows)
    .map((group) => {
      const sheetName = uniqueSheetName(group.name, usedSheetNames);
      const productRows = group.rows
        .map((row) =>
          workbookRow(saleChannelProductExportColumns.map((column) => column.value(row))),
        )
        .join("");

      return `<Worksheet ss:Name="${escapeXml(sheetName)}"><Table>${columns}${headerRow}${productRows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">
<Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/></Style></Styles>
${worksheets}
</Workbook>`;
}

function downloadSaleChannelProductsWorkbook(rows: SaleChannelProduct[]) {
  if (rows.length === 0) return;

  const workbook = buildSaleChannelProductsWorkbook(rows);
  const blob = new Blob([workbook], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `sale-channel-products-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

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
  const clientReady = useClientReady();
  const productFilters = useListFilterState({ initialFilters: filterDefaults });
  const debouncedSearch = useDebouncedValue(productFilters.search);
  const [selectedCategoryIdState, setSelectedCategoryId] = useState<string | null>(null);
  const categoryButtonRefs = useRef(new Map<string, HTMLButtonElement>());

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
  const selectedCategoryIndex = selectedCategoryId
    ? categoryOptions.findIndex((category) => category.id === selectedCategoryId)
    : -1;
  const canGoToPreviousCategory = selectedCategoryIndex > 0;
  const canGoToNextCategory =
    selectedCategoryIndex >= 0 && selectedCategoryIndex < categoryOptions.length - 1;

  useEffect(() => {
    if (!selectedCategoryId) return;
    categoryButtonRefs.current
      .get(selectedCategoryId)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [selectedCategoryId]);

  function selectCategoryByOffset(offset: number) {
    const nextCategory = categoryOptions[selectedCategoryIndex + offset];
    if (!nextCategory) return;
    setSelectedCategoryId(nextCategory.id);
  }

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
  const isTablePending = isPending && data.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Browse catalog SKUs and release details.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => downloadSaleChannelProductsWorkbook(data)}
          disabled={isPending || data.length === 0}
          className="w-fit"
        >
          <Download data-icon="inline-start" className="size-4" />
          Download CSV
        </Button>
      </div>

      {categoryOptions.length > 0 ? (
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="absolute -left-9 top-1/2 z-10 -translate-y-1/2 bg-background shadow-sm active:not-aria-[haspopup]:-translate-y-1/2"
            onClick={() => selectCategoryByOffset(-1)}
            disabled={!canGoToPreviousCategory}
            aria-label="Previous product category"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex w-max gap-2">
              {categoryOptions.map((category) => {
                const selected = category.id === selectedCategoryId;

                return (
                  <Button
                    key={category.id}
                    ref={(node) => {
                      if (node) {
                        categoryButtonRefs.current.set(category.id, node);
                      } else {
                        categoryButtonRefs.current.delete(category.id);
                      }
                    }}
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
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="absolute -right-9 top-1/2 z-10 -translate-y-1/2 bg-background shadow-sm active:not-aria-[haspopup]:-translate-y-1/2"
            onClick={() => selectCategoryByOffset(1)}
            disabled={!canGoToNextCategory}
            aria-label="Next product category"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
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
              disabled: clientReady && (isPending || collectionOptions.length === 0),
            },
          ]}
          hasActiveFilters={productFilters.hasActiveFilters}
          onClear={productFilters.resetFilters}
          resultCount={filteredRows.length}
          totalCount={data.length}
        />
        <SaleChannelProductsTable
          rows={pagedRows}
          isPending={isTablePending}
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
