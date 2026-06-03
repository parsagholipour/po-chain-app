"use client";

import { type FormEvent, type KeyboardEvent, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceField } from "@/components/ui/price-field";
import { PriceView } from "@/components/ui/price-view";
import { LineItemCard } from "@/components/po/line-items/line-items-grid";
import type { PoLineRow, Product } from "@/lib/types/api";
import { Loader2, Pencil, Trash2 } from "lucide-react";

type Props = {
  line: PoLineRow;
  onPatch?: (body: Record<string, unknown>) => void;
  onDelete?: () => void;
  busy: boolean;
  onEditProduct?: (product: Product) => void;
  readOnly?: boolean;
  hideManufacturingDetails?: boolean;
};

function moneyInputValue(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function parseMoney(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(2)) : undefined;
}

export function PoLineGridCard({
  line,
  onPatch,
  onDelete,
  busy,
  onEditProduct,
  readOnly = false,
  hideManufacturingDetails = false,
}: Props) {
  const [orderedQty, setOrderedQty] = useState(line.orderedQuantity);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [costValue, setCostValue] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [pricingError, setPricingError] = useState<string | null>(null);

  const qtyMismatch = !hideManufacturingDetails && line.quantity !== line.orderedQuantity;
  const manufacturingQuantity = line.allocations.reduce((sum, row) => sum + row.quantity, 0);
  const warehouseQuantity = line.warehouseAllocations.reduce((sum, row) => sum + row.quantity, 0);
  const fulfilledQuantity = manufacturingQuantity + warehouseQuantity;
  const remainingQuantity = Math.max(0, line.quantity - fulfilledQuantity);
  const showCost = !readOnly;
  const subtitle = hideManufacturingDetails
    ? `Ordered: ${line.orderedQuantity}`
    : `${line.product.defaultManufacturer.name} - Ordered: ${orderedQty}${
        qtyMismatch ? ` - Effective: ${line.quantity}` : ""
      }`;

  function openPricingEditor() {
    setCostValue(moneyInputValue(line.unitCost));
    setPriceValue(moneyInputValue(line.unitPrice));
    setPricingError(null);
    setPricingOpen(true);
  }

  function commitOrderedQty(next: number) {
    const qty = Math.max(1, next);
    setOrderedQty(qty);
    if (qty !== line.orderedQuantity) onPatch?.({ quantity: qty });
  }

  function handleOrderedQtyKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      commitOrderedQty(orderedQty + 1);
    } else if (event.key === "ArrowDown" && orderedQty > 1) {
      event.preventDefault();
      commitOrderedQty(orderedQty - 1);
    }
  }

  function submitPricing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onPatch) return;
    const unitCost = parseMoney(costValue);
    const unitPrice = parseMoney(priceValue);
    if (unitCost === undefined || unitPrice === undefined) {
      setPricingError("Enter valid non-negative cost and price values.");
      return;
    }
    onPatch({ unitCost, unitPrice });
    setPricingOpen(false);
  }

  return (
    <>
      <LineItemCard
        imageKey={line.product.imageKey}
        title={line.product.name}
        subtitle={subtitle}
        onEditProduct={onEditProduct ? () => onEditProduct(line.product) : undefined}
        viewOnly={readOnly}
        footer={
          <div className="flex flex-col gap-2 text-start">
            <p className="text-xs text-muted-foreground font-mono">{line.product.sku}</p>
            {qtyMismatch ? (
              <p className="text-xs">
                <Badge variant="secondary" className="font-normal">
                  Ordered {line.orderedQuantity} - Effective {line.quantity}
                </Badge>
              </p>
            ) : null}
            {!hideManufacturingDetails ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Default manufacturer:{" "}
                  <span className="font-medium text-foreground">
                    {line.product.defaultManufacturer.name}
                  </span>
                </p>
                <div className="grid grid-cols-3 gap-1 text-xs">
                  <Badge variant="outline" className="justify-center font-normal">
                    MO {manufacturingQuantity}
                  </Badge>
                  <Badge variant="outline" className="justify-center font-normal">
                    WO {warehouseQuantity}
                  </Badge>
                  <Badge variant="secondary" className="justify-center font-normal">
                    Left {remainingQuantity}
                  </Badge>
                </div>
              </>
            ) : null}
            <div className="rounded-md border border-border/60 bg-muted/20 p-2">
              <div
                className={`grid ${
                  showCost ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-1"
                } items-center gap-2 text-xs`}
              >
                {showCost ? (
                  <div className="min-w-0">
                    <div className="text-muted-foreground">Cost</div>
                    <PriceView value={line.unitCost} />
                  </div>
                ) : null}
                <div className="min-w-0">
                  <div className="text-muted-foreground">Price</div>
                  <PriceView value={line.unitPrice} />
                </div>
                {showCost && onPatch ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    onClick={openPricingEditor}
                    aria-label={`Edit cost and price for ${line.product.name}`}
                    title="Edit cost and price"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
            {!readOnly && onPatch && onDelete ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  className="min-w-0 flex-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={orderedQty}
                  onChange={(e) => setOrderedQty(Math.max(1, Number(e.target.value) || 1))}
                  onBlur={() => {
                    if (orderedQty !== line.orderedQuantity) onPatch({ quantity: orderedQty });
                  }}
                  onKeyDown={handleOrderedQtyKeyDown}
                  disabled={busy}
                />
                <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ) : null}
          </div>
        }
      />

      <Dialog open={pricingOpen} onOpenChange={setPricingOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit line pricing</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitPricing}>
            <div className="min-w-0 space-y-1">
              <div className="truncate text-sm font-medium">{line.product.name}</div>
              <div className="font-mono text-xs text-muted-foreground">{line.product.sku}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 pb-2">
              <div className="space-y-2">
                <Label htmlFor={`po-line-cost-${line.id}`}>Cost</Label>
                <PriceField
                  id={`po-line-cost-${line.id}`}
                  value={costValue}
                  disabled={busy}
                  placeholder="0.00"
                  onChange={(event) => {
                    setCostValue(event.target.value);
                    setPricingError(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`po-line-price-${line.id}`}>Price</Label>
                <PriceField
                  id={`po-line-price-${line.id}`}
                  value={priceValue}
                  disabled={busy}
                  placeholder="0.00"
                  onChange={(event) => {
                    setPriceValue(event.target.value);
                    setPricingError(null);
                  }}
                />
              </div>
            </div>
            {pricingError ? <p className="text-xs text-destructive">{pricingError}</p> : null}
            <DialogFooter className="border-0 bg-transparent">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setPricingOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
