"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableSelectItem } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
            {rows.map((row, i) => {
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
    </div>
  );
}
