"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableSelectItem } from "@/components/ui/searchable-select";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePagination } from "@/hooks/use-pagination";

/** One row: searchable entity id (e.g. product or PO line) + quantity. */
export type PoLinesSelectRow = {
  entityId: string;
  quantity: number;
};

export function emptyPoLinesSelectRow(): PoLinesSelectRow {
  return { entityId: "", quantity: 1 };
}

type Props = {
  isPending?: boolean;
  /** Shown when not loading and there are no selectable items. */
  emptyItemsMessage?: string;
  selectColumnLabel: string;
  selectPlaceholder?: string;
  items: readonly SearchableSelectItem[];
  /** Per-row options (e.g. hide entities already picked on another row). Defaults to `items`. */
  getItemsForRow?: (
    rowIndex: number,
    row: PoLinesSelectRow,
  ) => readonly SearchableSelectItem[];
  rows: PoLinesSelectRow[];
  onUpdateRow: (index: number, patch: Partial<PoLinesSelectRow>) => void;
  onRemoveRow: (index: number) => void;
};

export function PoLinesSelectTable({
  isPending = false,
  emptyItemsMessage = "Add items first.",
  selectColumnLabel,
  selectPlaceholder = "Select…",
  items,
  getItemsForRow,
  rows,
  onUpdateRow,
  onRemoveRow,
}: Props) {
  const pagination = usePagination({ totalItems: rows.length });
  const pagedRows = pagination.sliceItems(rows);
  const quantityInputRefs = useRef(new Map<number, HTMLInputElement>());
  const pendingQuantityFocusIndex = useRef<number | null>(null);

  const focusPendingQuantityInput = useCallback(() => {
    const index = pendingQuantityFocusIndex.current;
    if (index === null) return false;

    const input = quantityInputRefs.current.get(index);
    if (!input || input.disabled) return false;

    input.focus();
    input.select();
    pendingQuantityFocusIndex.current = null;
    return true;
  }, []);

  useEffect(() => {
    if (pendingQuantityFocusIndex.current === null) return;

    const frame = window.requestAnimationFrame(() => {
      focusPendingQuantityInput();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusPendingQuantityInput, pagination.page, pagination.startIndex, pagination.endIndex, rows]);

  function setQuantityInputRef(index: number, input: HTMLInputElement | null) {
    if (input) {
      quantityInputRefs.current.set(index, input);
    } else {
      quantityInputRefs.current.delete(index);
    }
  }

  function handleQuantityKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== "Enter") return;

    event.preventDefault();

    const nextIndex = index + 1;
    if (nextIndex >= rows.length) return;

    pendingQuantityFocusIndex.current = nextIndex;

    const nextPage = Math.floor(nextIndex / pagination.pageSize) + 1;
    if (nextPage !== pagination.page) {
      pagination.setPage(nextPage);
      return;
    }

    focusPendingQuantityInput();
  }

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyItemsMessage}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border/80">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{selectColumnLabel}</TableHead>
              <TableHead className="w-28">Qty</TableHead>
              <TableHead className="w-14" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.map((row, offset) => {
              const i = pagination.startIndex + offset;
              const hasEntity = row.entityId.length > 0;
              const rowItems = getItemsForRow ? getItemsForRow(i, row) : items;
              const noChoices = rowItems.length === 0;
              return (
                <TableRow key={i}>
                  <TableCell>
                    <SearchableSelect
                      className="w-full min-w-[160px]"
                      items={rowItems}
                      value={row.entityId}
                      placeholder={selectPlaceholder}
                      disabled={noChoices}
                      emptyMessage={noChoices ? "All lines are already selected." : undefined}
                      onValueChange={(entityId) => onUpdateRow(i, { entityId })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      ref={(input) => setQuantityInputRef(i, input)}
                      type="number"
                      min={1}
                      className="w-24"
                      disabled={!hasEntity}
                      value={hasEntity ? row.quantity : ""}
                      placeholder={hasEntity ? undefined : "—"}
                      onChange={(e) =>
                        onUpdateRow(i, {
                          quantity: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      onKeyDown={(event) => handleQuantityKeyDown(event, i)}
                    />
                  </TableCell>
                  <TableCell>
                    {hasEntity ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveRow(i)}>
                        Remove
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        {...pagination}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
      />
    </div>
  );
}
