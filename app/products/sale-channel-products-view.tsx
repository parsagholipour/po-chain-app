"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, ShoppingCart, X } from "lucide-react";
import { useRouter } from "nextjs-toploader/app";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import type { SaleChannel, SaleChannelProduct } from "@/lib/types/api";
import { SaleChannelProductsTable } from "@/components/po/products/sale-channel-products-table";
import { Button } from "@/components/ui/button";
import { ListFilters } from "@/components/ui/list-filters";
import { TableContainer } from "@/components/ui/table-container";
import {
  productPickerStorageKey,
  removeBrowserStorageItem,
  selectedProductsStorageKey,
  writeBrowserStorageItem,
} from "@/app/new-order/browser-storage";
import { useClientReady } from "@/hooks/use-client-ready";
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
const noCategoryId = "__no_category__";
const categoryActivationLeadPx = 32;

type WorkbookCellValue = string | number | null | undefined;

type SaleChannelProductExportColumn = {
  label: string;
  value: (row: SaleChannelProduct) => WorkbookCellValue;
  width: number;
};

type CategoryProductGroup = {
  id: string;
  name: string;
  rows: SaleChannelProduct[];
};

type CategoryNavFrame = {
  active: boolean;
  top: number;
  left: number;
  width: number;
  height: number;
};

const initialCategoryNavFrame: CategoryNavFrame = {
  active: false,
  top: 0,
  left: 0,
  width: 0,
  height: 0,
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
  const groups = new Map<string, CategoryProductGroup>();

  for (const row of rows) {
    const key = row.category?.id ?? noCategoryId;
    const current = groups.get(key);

    if (current) {
      current.rows.push(row);
    } else {
      groups.set(key, {
        id: key,
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

function filenameFromContentDisposition(value: string | null) {
  if (!value) return null;

  const encoded = value.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ""));
    } catch {
      return encoded.trim().replace(/^"|"$/g, "");
    }
  }

  return value.match(/filename\s*=\s*("[^"]+"|[^;]+)/i)?.[1]?.trim().replace(/^"|"$/g, "") ?? null;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function responseErrorMessage(response: Response) {
  const data = (await response.json().catch(() => null)) as { message?: string } | null;
  return data?.message ?? `Request failed (${response.status})`;
}

function selectedProductsLabel(count: number) {
  return `${count} selected`;
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

function topStickyOffset(exclude?: HTMLElement | null) {
  const stickyHeaders = Array.from(
    document.querySelectorAll<HTMLElement>("header.sticky"),
  );

  return stickyHeaders.reduce((offset, header) => {
    if (exclude && (header === exclude || header.contains(exclude))) return offset;

    const rect = header.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top > 1) return offset;

    return Math.max(offset, rect.bottom);
  }, 0);
}

function sameCategoryNavFrame(a: CategoryNavFrame, b: CategoryNavFrame) {
  return (
    a.active === b.active &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  );
}

export function SaleChannelProductsView() {
  const clientReady = useClientReady();
  const router = useRouter();
  const productFilters = useListFilterState({ initialFilters: filterDefaults });
  const debouncedSearch = useDebouncedValue(productFilters.search);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [categoryNavFrame, setCategoryNavFrame] = useState<CategoryNavFrame>(
    initialCategoryNavFrame,
  );
  const productListRef = useRef<HTMLDivElement>(null);
  const categoryNavShellRef = useRef<HTMLDivElement>(null);
  const categoryNavRef = useRef<HTMLElement>(null);
  const categoryButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const categorySectionRefs = useRef(new Map<string, HTMLElement>());
  const categoryActivationLockRef = useRef<string | null>(null);
  const categoryActivationLockTimeoutRef = useRef<number | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isImageZipDownloading, setIsImageZipDownloading] = useState(false);

  const { data = [], isPending } = useQuery({
    queryKey: saleChannelProductsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<SaleChannelProduct[]>("/api/sale-channel/products");
      return rows;
    },
  });

  const { data: saleChannels = [], isPending: saleChannelsPending } = useQuery({
    queryKey: ["sale-channels"],
    queryFn: async () => {
      const { data: rows } = await api.get<SaleChannel[]>("/api/sale-channels");
      return rows;
    },
  });

  const orderSaleChannel = useMemo(
    () =>
      saleChannels.find((channel) => channel.type === "store" || channel.type === "distributor") ??
      null,
    [saleChannels],
  );

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

  const filteredRows = useMemo(() => {
    const q = normalizeListFilterText(debouncedSearch);
    const collectionFilter = productFilters.filters.collection;

    return data.filter((row) => {
      if (q && !searchHaystack(row).includes(q)) return false;
      if (collectionFilter === LIST_FILTER_ALL_VALUE) return true;
      if (collectionFilter === uncollectedFilterValue) return row.collection === null;
      return row.collection?.id === collectionFilter;
    });
  }, [data, debouncedSearch, productFilters.filters.collection]);

  const filteredRowIds = useMemo(
    () => new Set(filteredRows.map((row) => row.id)),
    [filteredRows],
  );
  const selectedRows = useMemo(
    () => filteredRows.filter((row) => selectedProductIds.has(row.id)),
    [filteredRows, selectedProductIds],
  );
  const categoryGroups = useMemo(() => categoryProductGroups(filteredRows), [filteredRows]);
  const isTablePending = isPending && data.length === 0;
  const visibleActiveCategoryId =
    activeCategoryId && categoryGroups.some((group) => group.id === activeCategoryId)
      ? activeCategoryId
      : categoryGroups[0]?.id ?? null;
  const categoryScrollMarginTop = categoryNavFrame.top + categoryNavFrame.height + 12 || 112;

  useEffect(() => {
    setSelectedProductIds((current) => {
      if (current.size === 0) return current;

      let changed = false;
      const next = new Set<string>();

      for (const id of current) {
        if (filteredRowIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [filteredRowIds]);

  const handleRowSelectionChange = useCallback((rowId: string, selected: boolean) => {
    setSelectedProductIds((current) => {
      if (selected && current.has(rowId)) return current;
      if (!selected && !current.has(rowId)) return current;

      const next = new Set(current);
      if (selected) {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }
      return next;
    });
  }, []);

  const handleRowsSelectionChange = useCallback(
    (rows: SaleChannelProduct[], selected: boolean) => {
      setSelectedProductIds((current) => {
        const next = new Set(current);

        for (const row of rows) {
          if (selected) {
            next.add(row.id);
          } else {
            next.delete(row.id);
          }
        }

        return next;
      });
    },
    [],
  );

  const handleDownloadSelectedProductImages = useCallback(async () => {
    if (selectedRows.length === 0 || isImageZipDownloading) return;

    setIsImageZipDownloading(true);
    try {
      const response = await fetch("/api/sale-channel/products/image-zip", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: selectedRows.map((row) => row.id) }),
      });

      if (!response.ok) {
        throw new Error(await responseErrorMessage(response));
      }

      const blob = await response.blob();
      const fileName =
        filenameFromContentDisposition(response.headers.get("content-disposition")) ??
        `sale-channel-product-images-${new Date().toISOString().slice(0, 10)}.zip`;
      const warningCount = Number(response.headers.get("x-download-warning-count") ?? "0");

      downloadBlob(blob, fileName);

      if (warningCount > 0) {
        toast.warning(
          `Zip downloaded with ${warningCount} skipped file${warningCount === 1 ? "" : "s"}`,
        );
      } else {
        toast.success("Image zip downloaded");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download image zip");
    } finally {
      setIsImageZipDownloading(false);
    }
  }, [isImageZipDownloading, selectedRows]);

  const handleCreateOrderDraft = useCallback(() => {
    if (selectedRows.length === 0 || isImageZipDownloading) return;

    if (!orderSaleChannel) {
      toast.error("Your account is not linked to an order sale channel");
      return;
    }

    const draftStorageKey = selectedProductsStorageKey(orderSaleChannel.id);

    removeBrowserStorageItem(draftStorageKey);
    removeBrowserStorageItem(productPickerStorageKey(orderSaleChannel.id));
    writeBrowserStorageItem(
      draftStorageKey,
      JSON.stringify(selectedRows.map((row) => row.id)),
    );
    router.push("/new-order");
  }, [isImageZipDownloading, orderSaleChannel, router, selectedRows]);

  const clearCategoryActivationLock = useCallback(() => {
    if (categoryActivationLockTimeoutRef.current != null) {
      window.clearTimeout(categoryActivationLockTimeoutRef.current);
      categoryActivationLockTimeoutRef.current = null;
    }

    categoryActivationLockRef.current = null;
  }, []);

  useEffect(() => clearCategoryActivationLock, [clearCategoryActivationLock]);

  useEffect(() => {
    if (!visibleActiveCategoryId) return;
    categoryButtonRefs.current
      .get(visibleActiveCategoryId)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [visibleActiveCategoryId]);

  useEffect(() => {
    const shell = categoryNavShellRef.current;
    const nav = categoryNavRef.current;
    const productList = productListRef.current;
    if (!shell || !nav || !productList || categoryGroups.length === 0) return;

    let frame = 0;

    const updateCategoryNavFrame = () => {
      frame = 0;

      const top = Math.round(topStickyOffset(nav));
      const shellRect = shell.getBoundingClientRect();
      const listRect = productList.getBoundingClientRect();
      const height = Math.round(nav.getBoundingClientRect().height);
      const active =
        shellRect.top <= top &&
        listRect.bottom > top + height &&
        shellRect.width > 0 &&
        height > 0;
      const nextFrame: CategoryNavFrame = {
        active,
        top,
        left: Math.round(shellRect.left),
        width: Math.round(shellRect.width),
        height,
      };

      setCategoryNavFrame((current) =>
        sameCategoryNavFrame(current, nextFrame) ? current : nextFrame,
      );
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateCategoryNavFrame);
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(shell);
    resizeObserver.observe(nav);
    resizeObserver.observe(productList);

    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [categoryGroups.length]);

  useEffect(() => {
    if (categoryGroups.length === 0) return;
    let frame = 0;

    const updateActiveCategory = () => {
      frame = 0;

      const activationLine =
        (categoryNavRef.current?.getBoundingClientRect().bottom ?? 0) +
        categoryActivationLeadPx;
      let nextCategoryId = categoryGroups[0]?.id ?? null;
      const lockedCategoryId = categoryActivationLockRef.current;

      if (lockedCategoryId) {
        const lockedSection = categorySectionRefs.current.get(lockedCategoryId);

        if (!lockedSection) {
          clearCategoryActivationLock();
        } else {
          const distanceToLanding = Math.abs(
            lockedSection.getBoundingClientRect().top - categoryScrollMarginTop,
          );

          if (distanceToLanding > categoryActivationLeadPx) {
            setActiveCategoryId((current) =>
              current === lockedCategoryId ? current : lockedCategoryId,
            );
            return;
          }

          clearCategoryActivationLock();
        }
      }

      for (const group of categoryGroups) {
        const section = categorySectionRefs.current.get(group.id);
        if (!section) continue;

        const rect = section.getBoundingClientRect();
        if (rect.top > activationLine) break;

        nextCategoryId = group.id;
        if (rect.bottom > activationLine) break;
      }

      if (!nextCategoryId) return;
      setActiveCategoryId((current) =>
        current === nextCategoryId ? current : nextCategoryId,
      );
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveCategory);
    };

    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [categoryGroups, categoryScrollMarginTop, clearCategoryActivationLock]);

  function scrollToCategory(categoryId: string) {
    const section = categorySectionRefs.current.get(categoryId);

    clearCategoryActivationLock();
    categoryActivationLockRef.current = categoryId;
    setActiveCategoryId(categoryId);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    categoryActivationLockTimeoutRef.current = window.setTimeout(() => {
      categoryActivationLockRef.current = null;
      categoryActivationLockTimeoutRef.current = null;
    }, 2000);
  }

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

      <div ref={productListRef} className="space-y-6">
        {categoryGroups.length > 0 ? (
          <div
            ref={categoryNavShellRef}
            className="-mx-3 sm:-mx-6 lg:-mx-8"
            style={categoryNavFrame.active ? { height: categoryNavFrame.height } : undefined}
          >
            <header
              ref={categoryNavRef}
              data-product-category-nav
              className={cn(
                "z-[60] border-y border-border/80 bg-background/95 px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6 lg:px-8",
                categoryNavFrame.active ? "fixed" : "sticky top-0",
              )}
              style={
                categoryNavFrame.active
                  ? {
                      top: categoryNavFrame.top,
                      left: categoryNavFrame.left,
                      width: categoryNavFrame.width,
                    }
                  : undefined
              }
            >
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex w-max gap-2">
                  {categoryGroups.map((category) => {
                    const selected = category.id === visibleActiveCategoryId;

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
                        aria-pressed={selected}
                        className={cn(
                          "h-9 shrink-0 gap-2 px-3",
                          !selected && "bg-background",
                        )}
                        onClick={() => scrollToCategory(category.id)}
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
                          {category.rows.length}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </header>
          </div>
        ) : null}

        <TableContainer>
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
            groups={categoryGroups.length > 0 ? categoryGroups : undefined}
            rows={[]}
            isPending={isTablePending}
            emptyMessage={
              productFilters.hasActiveFilters
                ? "No products match your filters."
                : "No products yet."
            }
            groupScrollMarginTop={categoryScrollMarginTop}
            selectedRowIds={selectedProductIds}
            onRowSelectionChange={handleRowSelectionChange}
            onRowsSelectionChange={handleRowsSelectionChange}
            onGroupHeaderRef={(groupId, node) => {
              if (node) {
                categorySectionRefs.current.set(groupId, node);
              } else {
                categorySectionRefs.current.delete(groupId);
              }
            }}
          />
        </TableContainer>
      </div>

      {selectedRows.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4 sm:bottom-6">
          <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <span className="truncate text-sm font-medium">
              {selectedProductsLabel(selectedRows.length)}
            </span>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5 sm:flex sm:shrink-0">
              <Button
                type="button"
                size="sm"
                onClick={handleCreateOrderDraft}
                disabled={saleChannelsPending || isImageZipDownloading}
                className="min-w-0 px-2 sm:px-3"
              >
                {saleChannelsPending ? (
                  <Loader2 data-icon="inline-start" className="size-3.5 animate-spin" />
                ) : (
                  <ShoppingCart data-icon="inline-start" className="size-3.5" />
                )}
                <span className="truncate">Create draft</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDownloadSelectedProductImages}
                disabled={isImageZipDownloading}
                className="min-w-0 px-2 sm:px-3"
              >
                {isImageZipDownloading ? (
                  <Loader2 data-icon="inline-start" className="size-3.5 animate-spin" />
                ) : (
                  <Download data-icon="inline-start" className="size-3.5" />
                )}
                <span className="truncate">
                  {isImageZipDownloading ? "Preparing" : "Download images"}
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Clear selected products"
                onClick={() => setSelectedProductIds(new Set())}
                disabled={isImageZipDownloading}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
