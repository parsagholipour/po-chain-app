"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LineItemCard } from "@/components/po/line-items/line-items-grid";
import type { PoLineRow, Product } from "@/lib/types/api";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  line: PoLineRow;
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
  busy: boolean;
  onEditProduct?: (product: Product) => void;
};

export function PoLineGridCard({
  line,
  onPatch,
  onDelete,
  busy,
  onEditProduct,
}: Props) {
  const [qty, setQty] = useState(line.quantity);

  useEffect(() => {
    setQty(line.quantity);
  }, [line.quantity]);

  const subtitle = `${line.product.defaultManufacturer.name} · Qty: ${qty}`;

  return (
    <LineItemCard
      imageKey={line.product.imageKey}
      title={line.product.name}
      subtitle={subtitle}
      onEditProduct={onEditProduct ? () => onEditProduct(line.product) : undefined}
      footer={
        <div className="flex flex-col gap-2 text-start">
          <p className="text-xs text-muted-foreground font-mono">{line.product.sku}</p>
          <p className="text-xs text-muted-foreground">
            Default manufacturer:{" "}
            <span className="font-medium text-foreground">
              {line.product.defaultManufacturer.name}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              className="min-w-0 flex-1"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              onBlur={() => {
                if (qty !== line.quantity) onPatch({ quantity: qty });
              }}
              disabled={busy}
            />
            <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      }
    />
  );
}
