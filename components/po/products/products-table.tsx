"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useRef, useState } from "react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import { StorageObjectLink } from "@/components/ui/storage-object-link";
import type { Product } from "@/lib/types/api";
import { useConfirm } from "@/components/confirm-provider";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { PriceView } from "@/components/ui/price-view";
import { productEditingStatusLabels } from "@/lib/product-editing-status";

type Props = {
  rows: Product[];
  isPending: boolean;
  emptyMessage?: string;
  onEdit: (row: Product) => void;
  onDelete: (row: Product) => void;
};

const columnCount = 23;
const headerSurfaceClassName = "bg-card shadow-[inset_0_-1px_0_var(--border)]";
const headerClassName = `sticky top-0 z-40 ${headerSurfaceClassName}`;
const productHeaders: { key: string; label: string; className?: string }[] = [
  { key: "image", label: "Image", className: "w-14" },
  { key: "name", label: "Name" },
  { key: "sku", label: "SKU" },
  { key: "upcGtin", label: "UPC/GTIN" },
  { key: "cost", label: "Cost", className: "text-end" },
  { key: "price", label: "Price", className: "text-end" },
  { key: "map", label: "MAP", className: "text-end" },
  { key: "msrp", label: "MSRP", className: "text-end" },
  { key: "mop", label: "MOQ", className: "text-end" },
  { key: "cartonQty", label: "Carton Qty", className: "text-end" },
  { key: "orderBy", label: "Order By" },
  { key: "status", label: "Status" },
  { key: "stock", label: "Stock", className: "text-end" },
  { key: "imageLink", label: "Image Link" },
  { key: "description", label: "Description" },
  { key: "barcode", label: "Barcode", className: "w-14" },
  { key: "packaging", label: "Packaging" },
  { key: "defaultMfr", label: "Default Mfr." },
  { key: "category", label: "Category" },
  { key: "type", label: "Type" },
  { key: "collection", label: "Collection" },
  { key: "verified", label: "Verified" },
  { key: "actions", label: "Actions", className: "w-[120px] text-end" },
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
  const stickyHeaders = Array.from(
    document.querySelectorAll<HTMLElement>("header.sticky"),
  );

  return stickyHeaders.reduce((offset, header) => {
    if (header.contains(root)) return offset;

    const rect = header.getBoundingClientRect();
    if (rect.top > 1 || rect.bottom <= 0) return offset;

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
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<StickyHeaderState>(
    initialStickyHeaderState,
  );

  useEffect(() => {
    const table = tableRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!table) return;

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
      const scrollRect = scrollContainer?.getBoundingClientRect() ?? tableRect;
      const headerHeight = headerRow.getBoundingClientRect().height;
      const active =
        tableRect.top < top && tableRect.bottom > top + headerHeight;
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

    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    scrollContainer?.addEventListener("scroll", schedule);
    schedule();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      scrollContainer?.removeEventListener("scroll", schedule);
      setState(initialStickyHeaderState);
    };
  }, [rowCount, isPending]);

  return { scrollContainerRef, tableRef, state };
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
  if (Number.isNaN(date.getTime()))
    return <span className="text-muted-foreground">None</span>;
  return date.toLocaleDateString();
}

function canOpenLink(value: string) {
  return /^https?:\/\//i.test(value);
}

export function ProductsTable({
  rows,
  isPending,
  emptyMessage = "No products yet.",
  onEdit,
  onDelete,
}: Props) {
  const confirm = useConfirm();
  const {
    scrollContainerRef,
    tableRef,
    state: stickyHeaderState,
  } = useFixedStickyTableHeader(rows.length, isPending);

  return (
    <>
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
            className="min-w-max caption-bottom border-separate border-spacing-0 text-sm"
            style={{
              marginLeft: stickyHeaderState.tableOffsetLeft,
              width: stickyHeaderState.tableWidth,
            }}
          >
            <TableHeader>
              <TableRow>
                {productHeaders.map((header, index) => {
                  const width = stickyHeaderState.columnWidths[index];

                  return (
                    <TableHead
                      key={header.key}
                      className={`${headerSurfaceClassName} ${header.className ?? ""}`}
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
        </div>
      ) : null}
      <div
        ref={scrollContainerRef}
        className="min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]"
      >
        <table
          ref={tableRef}
          data-slot="table"
          className="w-full min-w-max caption-bottom border-separate border-spacing-0 text-sm"
        >
          <TableHeader>
            <TableRow>
              {productHeaders.map((header) => (
                <TableHead
                  key={header.key}
                  className={`${headerClassName} ${header.className ?? ""}`}
                >
                  {header.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <StorageObjectImage
                      reference={row.imageKey}
                      className="size-8 shrink-0"
                      objectFit="cover"
                    />
                  </TableCell>
                  <TableCell className="min-w-56 max-w-72 whitespace-normal font-medium leading-snug">
                    {row.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {emptyValue(row.upcGtin)}
                  </TableCell>
                  <TableCell className="text-end text-muted-foreground">
                    <PriceView value={row.cost} />
                  </TableCell>
                  <TableCell className="text-end text-muted-foreground">
                    <PriceView value={row.price} />
                  </TableCell>
                  <TableCell className="text-end text-muted-foreground">
                    <PriceView value={row.map} />
                  </TableCell>
                  <TableCell className="text-end text-muted-foreground">
                    <PriceView value={row.msrp} />
                  </TableCell>
                  <TableCell className="text-end">
                    {emptyValue(row.mop)}
                  </TableCell>
                  <TableCell className="text-end">
                    {emptyValue(row.quantityPerCarton)}
                  </TableCell>
                  <TableCell>{formatDate(row.orderByDate)}</TableCell>
                  <TableCell>
                    {productEditingStatusLabels[row.editingStatus]}
                  </TableCell>
                  <TableCell className="text-end">
                    {emptyValue(row.stockCount)}
                  </TableCell>
                  <TableCell className="max-w-44 truncate">
                    {row.imageLink ? (
                      canOpenLink(row.imageLink) ? (
                        <a
                          href={row.imageLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1 truncate text-primary underline-offset-4 hover:underline"
                          title={row.imageLink}
                        >
                          <span className="truncate">{row.imageLink}</span>
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span title={row.imageLink}>{row.imageLink}</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="max-w-56 truncate"
                    title={row.description ?? undefined}
                  >
                    {emptyValue(row.description)}
                  </TableCell>
                  <TableCell>
                    <StorageObjectImage
                      reference={row.barcodeKey}
                      className="size-8 shrink-0"
                      objectFit="contain"
                    />
                  </TableCell>
                  <TableCell>
                    <StorageObjectLink
                      reference={row.packagingKey}
                      label="Open file"
                    />
                  </TableCell>
                  <TableCell
                    className="max-w-48 truncate"
                    title={row.defaultManufacturer.name}
                  >
                    {row.defaultManufacturer.name}
                  </TableCell>
                  <TableCell
                    className="max-w-44 truncate"
                    title={row.category?.name ?? undefined}
                  >
                    {row.category?.name ?? (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="max-w-44 truncate"
                    title={row.type?.name ?? undefined}
                  >
                    {row.type?.name ?? (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="max-w-44 truncate"
                    title={row.collection?.name ?? undefined}
                  >
                    {row.collection?.name ?? (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.verified ? (
                      <Badge variant="default">Yes</Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEdit(row)}
                        aria-label="Edit"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          void (async () => {
                            const ok = await confirm({
                              title: `Delete "${row.name}"?`,
                              confirmLabel: "Delete",
                              variant: "destructive",
                            });
                            if (ok) onDelete(row);
                          })();
                        }}
                        aria-label="Delete"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </div>
    </>
  );
}
