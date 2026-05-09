"use client";

import { Button } from "@/components/ui/button";
import { LineItemsGrid } from "@/components/po/line-items/line-items-grid";
import type { PoLineRow, Product } from "@/lib/types/api";
import { useConfirm } from "@/components/confirm-provider";
import { Plus } from "lucide-react";
import { PoLineGridCard } from "./po-line-grid-card";

type Props = {
  lines: PoLineRow[];
  onAddLine?: () => void;
  onPatchLine?: (lineId: string, body: Record<string, unknown>) => void;
  onDeleteLine?: (lineId: string) => void;
  lineMutationPending: boolean;
  onEditProduct?: (product: Product) => void;
  readOnly?: boolean;
};

export function PoLinesSection({
  lines,
  onAddLine,
  onPatchLine,
  onDeleteLine,
  lineMutationPending,
  onEditProduct,
  readOnly = false,
}: Props) {
  const confirm = useConfirm();
  const canMutateLines =
    !readOnly && onAddLine != null && onPatchLine != null && onDeleteLine != null;

  return (
    <section className="space-y-4" aria-labelledby="po-lines-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 id="po-lines-heading" className="text-lg font-semibold">
          Line items
        </h2>
        {canMutateLines ? (
          <Button type="button" size="sm" onClick={onAddLine}>
            <Plus className="size-4" />
            Add line
          </Button>
        ) : null}
      </div>
      {lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-12 text-center text-sm text-muted-foreground">
          No line items yet.
        </p>
      ) : (
        <LineItemsGrid>
          {lines.map((line) => (
            <PoLineGridCard
              key={`${line.id}-${line.orderedQuantity}-${line.quantity}`}
              line={line}
              onPatch={canMutateLines ? (body) => onPatchLine!(line.id, body) : undefined}
              onDelete={
                canMutateLines
                  ? () => {
                      void (async () => {
                        const ok = await confirm({
                          title: "Remove this line?",
                          confirmLabel: "Remove",
                          variant: "destructive",
                        });
                        if (ok) onDeleteLine!(line.id);
                      })();
                    }
                  : undefined
              }
              busy={lineMutationPending}
              onEditProduct={onEditProduct}
              readOnly={readOnly}
            />
          ))}
        </LineItemsGrid>
      )}
    </section>
  );
}
