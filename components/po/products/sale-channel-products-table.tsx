"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PriceView } from "@/components/ui/price-view";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import { storageObjectDisplayName } from "@/lib/storage/display-name";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SaleChannelProduct } from "@/lib/types/api";
import { productEditingStatusLabels } from "@/lib/product-editing-status";
import { storageDownloadUrl } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

type Props = {
  rows?: SaleChannelProduct[];
  groups?: SaleChannelProductsTableGroup[];
  isPending: boolean;
  emptyMessage?: string;
  groupScrollMarginTop?: number;
  onGroupHeaderRef?: (groupId: string, node: HTMLTableRowElement | null) => void;
  selectedRowIds?: ReadonlySet<string>;
  onRowSelectionChange?: (rowId: string, selected: boolean) => void;
  onRowsSelectionChange?: (rows: SaleChannelProduct[], selected: boolean) => void;
};

export type SaleChannelProductsTableGroup = {
  id: string;
  name: string;
  rows: SaleChannelProduct[];
};

const columnCount = 17;
const stickySkuColumnClassName = "w-44 min-w-44 max-w-44";
const stickyProductNameColumnClassName = "w-72 min-w-72 max-w-72";
const stickySkuClassName =
  `sticky left-0 z-20 ${stickySkuColumnClassName} bg-card`;
const stickyProductNameClassName =
  `sticky left-[var(--sale-channel-sticky-sku-width,9rem)] z-[21] ${stickyProductNameColumnClassName} bg-card shadow-[inset_-1px_0_0_var(--border)]`;
const saleChannelTableClassName =
  "w-full min-w-max caption-bottom border-separate border-spacing-0 text-sm";
const stickyGroupHeaderClassName =
  "sticky left-0 z-[22] bg-background px-3 py-3 shadow-[inset_0_-1px_0_var(--border),inset_-1px_0_0_var(--border)] sm:px-4";
const stickyBodyClassName =
  "group-hover:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]";
const headerSurfaceClassName = "bg-card shadow-[inset_0_-1px_0_var(--border)]";
const stickyOverlayHeaderCellClassName =
  "absolute top-0 z-20 flex items-center px-3 text-left align-middle font-medium whitespace-nowrap text-foreground sm:px-4";
const saleChannelProductHeaders: {
  key: string;
  label: string;
  className?: string;
  scrollingClassName?: string;
}[] = [
  {
    key: "sku",
    label: "SKU",
    className: stickySkuClassName,
    scrollingClassName: stickySkuColumnClassName,
  },
  {
    key: "name",
    label: "Product Name",
    className: stickyProductNameClassName,
    scrollingClassName: stickyProductNameColumnClassName,
  },
  { key: "upcGtin", label: "UPC/GTIN" },
  { key: "collection", label: "Collection" },
  { key: "msrp", label: "MSRP", className: "text-end" },
  { key: "map", label: "MAP", className: "text-end" },
  { key: "wholesalePrice", label: "Wholesale Price", className: "text-end" },
  { key: "moq", label: "MOQ", className: "text-end" },
  { key: "imageLink", label: "Image Link" },
  { key: "barcode", label: "Barcode Image", className: "w-28" },
  { key: "stockStatus", label: "Stock Status" },
  { key: "stockCount", label: "Stock Count", className: "text-end" },
  { key: "quantityPerCarton", label: "Qty/Carton", className: "text-end" },
  { key: "description", label: "Description" },
  { key: "orderByDate", label: "Order By Date" },
  { key: "releaseDateShipsFrom", label: "Release Date (Ships From)" },
  { key: "editionStatus", label: "Edition Status" },
];

type StickyHeaderState = {
  active: boolean;
  top: number;
  left: number;
  width: number;
  height: number;
  tableWidth: number;
  tableOffsetLeft: number;
  columnWidths: number[];
};

const initialStickyHeaderState: StickyHeaderState = {
  active: false,
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  tableWidth: 0,
  tableOffsetLeft: 0,
  columnWidths: [],
};

function stickyViewportTop(root: HTMLElement) {
  const rootRect = root.getBoundingClientRect();
  const stickyHeaders = Array.from(
    document.querySelectorAll<HTMLElement>("header.sticky, [data-product-category-nav]"),
  );

  return stickyHeaders.reduce((offset, header) => {
    if (header.contains(root)) return offset;

    const position = window.getComputedStyle(header).position;
    if (position !== "fixed" && position !== "sticky") return offset;

    const rect = header.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= rootRect.bottom) return offset;

    return Math.max(offset, rect.bottom);
  }, 0);
}

function sameStickyHeaderState(a: StickyHeaderState, b: StickyHeaderState) {
  return (
    a.active === b.active &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height &&
    a.tableWidth === b.tableWidth &&
    a.tableOffsetLeft === b.tableOffsetLeft &&
    a.columnWidths.length === b.columnWidths.length &&
    a.columnWidths.every((width, index) => width === b.columnWidths[index])
  );
}

function useFixedStickyTableHeader(rowCount: number, isPending: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [state, setState] = useState<StickyHeaderState>(
    initialStickyHeaderState,
  );

  useEffect(() => {
    const scroll = scrollRef.current;
    const table = tableRef.current;
    if (!scroll || !table) return;

    const headerRow = table.querySelector<HTMLElement>(
      '[data-slot="table-header"] tr',
    );
    const headerCells = Array.from(
      table.querySelectorAll<HTMLElement>('[data-slot="table-head"]'),
    );
    if (!headerRow || headerCells.length === 0) return;

    let frame = 0;

    const update = () => {
      frame = 0;

      const top = stickyViewportTop(table);
      const tableRect = table.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      const headerHeight = headerRow.getBoundingClientRect().height;
      const active =
        tableRect.top < top &&
        tableRect.bottom > top + headerHeight &&
        scrollRect.bottom > top;
      const nextState: StickyHeaderState = {
        active,
        top: Math.round(top),
        left: Math.round(scrollRect.left),
        width: Math.round(scrollRect.width),
        height: Math.round(headerHeight),
        tableWidth: Math.round(tableRect.width),
        tableOffsetLeft: Math.round(tableRect.left - scrollRect.left),
        columnWidths: headerCells.map((cell) =>
          Math.round(cell.getBoundingClientRect().width),
        ),
      };

      setState((current) =>
        sameStickyHeaderState(current, nextState) ? current : nextState,
      );
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(scroll);
    resizeObserver.observe(table);
    resizeObserver.observe(headerRow);

    scroll.addEventListener("scroll", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      scroll.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      setState(initialStickyHeaderState);
    };
  }, [rowCount, isPending]);

  return { scrollRef, tableRef, state };
}

function emptyValue(value: string | number | null | undefined) {
  return value == null || value === "" ? (
    <span className="text-muted-foreground">None</span>
  ) : (
    value
  );
}

function formatDate(value: string | null) {
  if (!value) return <span className="text-muted-foreground">None</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function canOpenLink(value: string) {
  return /^https?:\/\//i.test(value);
}

function StockStatus({ stockCount }: { stockCount: number | null }) {
  if (stockCount == null) {
    return <Badge variant="outline">Unknown</Badge>;
  }

  if (stockCount <= 0) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Out of stock
      </Badge>
    );
  }

  return <Badge variant="default">In stock</Badge>;
}

function ImageLinkCell({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">None</span>;

  if (!canOpenLink(value)) {
    return <span title={value}>{value}</span>;
  }

  return (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1 truncate text-primary underline-offset-4 hover:underline"
      title={value}
    >
      <span className="truncate">{value}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

function ProductImageCell({ product }: { product: SaleChannelProduct }) {
  const [imageLinkFailed, setImageLinkFailed] = useState(false);
  const canShowImageLink = canOpenLink(product.imageLink) && !imageLinkFailed;

  if (product.imageKey) {
    return (
      <StorageObjectImage
        reference={product.imageKey}
        alt={product.name}
        className="size-12 shrink-0 bg-muted/30"
        objectFit="cover"
        previewWidth={192}
        fallback="No image"
      />
    );
  }

  return (
    <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30 text-center text-xs text-muted-foreground">
      {canShowImageLink ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageLink}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => setImageLinkFailed(true)}
        />
      ) : (
        "No image"
      )}
    </div>
  );
}

function barcodeDownloadFileName(product: SaleChannelProduct) {
  const displayName = storageObjectDisplayName(product.barcodeKey);
  const ext = displayName?.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ".png";
  const sku = product.sku
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${sku || "product"}-barcode${ext}`;
}

function BarcodeImageDownload({ product }: { product: SaleChannelProduct }) {
  if (!product.barcodeKey) {
    return (
      <StorageObjectImage
        reference={null}
        className="h-10 w-24 shrink-0"
        aspectFallback="3 / 1"
        objectFit="contain"
        fallback={<span className="text-muted-foreground">None</span>}
      />
    );
  }

  const fileName = barcodeDownloadFileName(product);

  return (
    <a
      href={storageDownloadUrl(product.barcodeKey, fileName)}
      download={fileName}
      target="_blank"
      rel="noreferrer"
      className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`Download barcode for ${product.name}`}
      title="Download barcode"
    >
      <StorageObjectImage
        reference={product.barcodeKey}
        alt={`${product.name} barcode`}
        className="h-10 w-24 shrink-0 bg-background"
        aspectFallback="3 / 1"
        objectFit="contain"
        previewWidth={256}
      />
    </a>
  );
}

function SaleChannelProductRow({
  row,
  selected = false,
  onSelectionChange,
}: {
  row: SaleChannelProduct;
  selected?: boolean;
  onSelectionChange?: (rowId: string, selected: boolean) => void;
}) {
  return (
    <TableRow key={row.id} className="group" data-state={selected ? "selected" : undefined}>
      <TableCell
        className={cn(
          stickySkuClassName,
          stickyBodyClassName,
          "font-mono text-xs",
        )}
        title={row.sku}
      >
        <div className="flex min-w-0 items-center gap-2">
          {onSelectionChange ? (
            <Checkbox
              aria-label={`Select ${row.name}`}
              checked={selected}
              onCheckedChange={(checked) => onSelectionChange(row.id, checked === true)}
            />
          ) : null}
          <span className="min-w-0 truncate">{row.sku}</span>
        </div>
      </TableCell>
      <TableCell
        className={cn(
          stickyProductNameClassName,
          stickyBodyClassName,
          "whitespace-normal font-medium leading-snug",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <ProductImageCell product={row} />
          <span className="min-w-0">{row.name}</span>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">{emptyValue(row.upcGtin)}</TableCell>
      <TableCell className="max-w-44 truncate" title={row.collection?.name ?? undefined}>
        {row.collection?.name ?? <span className="text-muted-foreground">None</span>}
      </TableCell>
      <TableCell className="text-end text-muted-foreground">
        <PriceView value={row.msrp} />
      </TableCell>
      <TableCell className="text-end text-muted-foreground">
        <PriceView value={row.map} />
      </TableCell>
      <TableCell className="text-end">
        <PriceView value={row.wholesalePrice} />
      </TableCell>
      <TableCell className="text-end">{emptyValue(row.moq)}</TableCell>
      <TableCell className="max-w-56 truncate">
        <ImageLinkCell value={row.imageLink} />
      </TableCell>
      <TableCell>
        <BarcodeImageDownload product={row} />
      </TableCell>
      <TableCell>
        <StockStatus stockCount={row.stockCount} />
      </TableCell>
      <TableCell className="text-end">{emptyValue(row.stockCount)}</TableCell>
      <TableCell className="text-end">{emptyValue(row.quantityPerCarton)}</TableCell>
      <TableCell className="max-w-72 truncate" title={row.description ?? undefined}>
        {emptyValue(row.description)}
      </TableCell>
      <TableCell>{formatDate(row.orderByDate)}</TableCell>
      <TableCell>{formatDate(row.releaseDateShipsFrom)}</TableCell>
      <TableCell>{productEditingStatusLabels[row.editionStatus]}</TableCell>
    </TableRow>
  );
}

function productCountLabel(count: number) {
  return `${count} product${count === 1 ? "" : "s"}`;
}

export function SaleChannelProductsTable({
  rows = [],
  groups,
  isPending,
  emptyMessage = "No products yet.",
  groupScrollMarginTop,
  onGroupHeaderRef,
  selectedRowIds,
  onRowSelectionChange,
  onRowsSelectionChange,
}: Props) {
  const selectableRows = groups ? groups.flatMap((group) => group.rows) : rows;
  const selectedVisibleRowCount = selectedRowIds
    ? selectableRows.reduce((count, row) => count + (selectedRowIds.has(row.id) ? 1 : 0), 0)
    : 0;
  const selectionEnabled =
    Boolean(selectedRowIds && onRowSelectionChange) && selectableRows.length > 0;
  const allVisibleRowsSelected =
    selectionEnabled && selectedVisibleRowCount === selectableRows.length;
  const someVisibleRowsSelected =
    selectionEnabled && selectedVisibleRowCount > 0 && !allVisibleRowsSelected;
  const renderedRowCount = groups
    ? groups.reduce((count, group) => count + group.rows.length + 1, 0)
    : rows.length;
  const { scrollRef, tableRef, state: stickyHeaderState } = useFixedStickyTableHeader(
    renderedRowCount,
    isPending,
  );
  const stickySkuWidth = stickyHeaderState.columnWidths[0] ?? 144;
  const stickyProductNameWidth = stickyHeaderState.columnWidths[1] ?? 288;
  const stickyLeadingWidth = stickySkuWidth + stickyProductNameWidth;

  const stickyColumnStyle = {
    "--sale-channel-sticky-sku-width": `${stickySkuWidth}px`,
    "--sale-channel-sticky-product-name-width": `${stickyProductNameWidth}px`,
  } as CSSProperties;

  return (
    <div
      data-slot="table-scroll-shell"
      className="relative min-w-0"
      style={stickyColumnStyle}
    >
      {stickyHeaderState.active ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 overflow-hidden bg-card"
          style={{
            top: stickyHeaderState.top,
            left: stickyHeaderState.left,
            width: stickyHeaderState.width,
            height: stickyHeaderState.height,
          }}
        >
          <table
            className={cn("min-w-max", saleChannelTableClassName)}
            style={{
              width: stickyHeaderState.tableWidth,
              transform: `translateX(${stickyHeaderState.tableOffsetLeft}px)`,
            }}
          >
            <TableHeader>
              <TableRow>
                {saleChannelProductHeaders.map((header, index) => {
                  const width = stickyHeaderState.columnWidths[index];

                  return (
                    <TableHead
                      key={header.key}
                      className={cn(
                        headerSurfaceClassName,
                        header.scrollingClassName ?? header.className,
                      )}
                      style={
                        width
                          ? { width, minWidth: width, maxWidth: width }
                          : undefined
                      }
                    >
                      {header.label}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
          </table>
          <div
            className={cn(
              stickyOverlayHeaderCellClassName,
              headerSurfaceClassName,
            )}
            style={{
              left: 0,
              width: stickySkuWidth,
              height: stickyHeaderState.height,
            }}
          >
            SKU
          </div>
          <div
            className={cn(
              stickyOverlayHeaderCellClassName,
              headerSurfaceClassName,
              "z-[21] shadow-[inset_-1px_0_0_var(--border),inset_0_-1px_0_var(--border)]",
            )}
            style={{
              left: stickySkuWidth,
              width: stickyProductNameWidth,
              height: stickyHeaderState.height,
            }}
          >
            Product Name
          </div>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        data-slot="table-scroll"
        className="w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]"
      >
        <table
          ref={tableRef}
          data-slot="table"
          className={saleChannelTableClassName}
        >
          <TableHeader>
            <TableRow>
              {saleChannelProductHeaders.map((header) => (
                <TableHead
                  key={header.key}
                  className={cn(
                    header.className,
                    header.key === "sku" || header.key === "name"
                      ? "z-30"
                      : undefined,
                  )}
                >
                  {header.key === "sku" && selectionEnabled ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        aria-label={
                          allVisibleRowsSelected
                            ? "Deselect all visible products"
                            : "Select all visible products"
                        }
                        checked={allVisibleRowsSelected}
                        indeterminate={someVisibleRowsSelected}
                        onCheckedChange={(checked) =>
                          onRowsSelectionChange?.(selectableRows, checked === true)
                        }
                      />
                      <span>{header.label}</span>
                    </div>
                  ) : (
                    header.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : renderedRowCount === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : groups ? (
              groups.map((group) => (
                <Fragment key={group.id}>
                  <TableRow
                    ref={(node) => onGroupHeaderRef?.(group.id, node)}
                    className="bg-background hover:bg-background"
                    style={
                      groupScrollMarginTop
                        ? { scrollMarginTop: groupScrollMarginTop }
                        : undefined
                    }
                  >
                    <TableCell
                      colSpan={2}
                      className={stickyGroupHeaderClassName}
                      style={{
                        width: stickyLeadingWidth,
                        minWidth: stickyLeadingWidth,
                        maxWidth: stickyLeadingWidth,
                      }}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {group.name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {productCountLabel(group.rows.length)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell
                      colSpan={columnCount - 2}
                      className="bg-background p-0"
                      aria-hidden="true"
                    />
                  </TableRow>
                  {group.rows.map((row) => (
                    <SaleChannelProductRow
                      key={row.id}
                      row={row}
                      selected={selectedRowIds?.has(row.id)}
                      onSelectionChange={onRowSelectionChange}
                    />
                  ))}
                </Fragment>
              ))
            ) : (
              rows.map((row) => (
                <SaleChannelProductRow
                  key={row.id}
                  row={row}
                  selected={selectedRowIds?.has(row.id)}
                  onSelectionChange={onRowSelectionChange}
                />
              ))
            )}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
