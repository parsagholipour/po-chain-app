"use client";

import { Button } from "@/components/ui/button";
import { LineItemsGrid } from "@/components/po/line-items/line-items-grid";
import type { PoLineRow, Product } from "@/lib/types/api";
import { useConfirm } from "@/components/confirm-provider";
import { Plus } from "lucide-react";
import { PoLineGridCard } from "./po-line-grid-card";

type Props = {
  lines: PoLineRow[];
  onAddLine: () => void;
  onPatchLine: (lineId: string, body: Record<string, unknown>) => void;
  onDeleteLine: (lineId: string) => void;
  lineMutationPending: boolean;
  onEditProduct?: (product: Product) => void;
};

export function PoLinesSection({
  lines,
  onAddLine,
  onPatchLine,
  onDeleteLine,
  lineMutationPending,
  onEditProduct,
}: Props) {
  const confirm = useConfirm();

  return (
    <section className="space-y-4" aria-labelledby="po-lines-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 id="po-lines-heading" className="text-lg font-semibold">
          Line items
        </h2>
        <Button type="button" size="sm" onClick={onAddLine}>
          <Plus className="size-4" />
          Add line
        </Button>
      </div>
      {lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 py-12 text-center text-sm text-muted-foreground">
          No line items yet. Use <span className="font-medium text-foreground">Add line</span>{" "}
          to add products.
        </p>
      ) : (
        <LineItemsGrid>
          {lines.map((line) => (
            <PoLineGridCard
              key={`${line.id}-${line.orderedQuantity}-${line.quantity}`}
              line={line}
              onPatch={(body) => onPatchLine(line.id, body)}
              onDelete={() => {
                void (async () => {
                  const ok = await confirm({
                    title: "Remove this line?",
                    confirmLabel: "Remove",
                    variant: "destructive",
                  });
                  if (ok) onDeleteLine(line.id);
                })();
              }}
              busy={lineMutationPending}
              onEditProduct={onEditProduct}
            />
          ))}
        </LineItemsGrid>
      )}
    </section>
  );
}
