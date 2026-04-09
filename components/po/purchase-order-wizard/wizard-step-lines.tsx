"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Manufacturer, Product } from "@/lib/types/api";

export type LineDraft = {
  productId: string;
  manufacturerId: string;
  quantity: number;
};

/** New blank row template; trailing row in the wizard should use this until a product is chosen. */
export function emptyLineDraft(): LineDraft {
  return { productId: "", manufacturerId: "", quantity: 1 };
}

/** Lines that should be sent to the API (blank template row omitted). */
export function filledLines(lines: LineDraft[]): LineDraft[] {
  return lines.filter((l) => l.productId.length > 0);
}

type Props = {
  products: Product[];
  manufacturers: Manufacturer[];
  manufacturerIdList: string[];
  lines: LineDraft[];
  onUpdateLine: (index: number, patch: Partial<LineDraft>) => void;
  onRemoveLine: (index: number) => void;
  /** PO wizard: no per-line manufacturer (set on manufacturing order later). */
  hideManufacturer?: boolean;
};

export function WizardStepLines({
  products,
  manufacturers,
  manufacturerIdList,
  lines,
  onUpdateLine,
  onRemoveLine,
  hideManufacturer = false,
}: Props) {
  const productItems = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.sku})`,
      })),
    [products],
  );

  const manufacturerItems = useMemo(
    () =>
      manufacturerIdList.map((mid) => {
        const m = manufacturers.find((x) => x.id === mid);
        return { value: mid, label: m?.name ?? mid };
      }),
    [manufacturerIdList, manufacturers],
  );

  if (products.length === 0) {
    return <p className="text-sm text-muted-foreground">Add products first.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border/80">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="w-28">Qty</TableHead>
              {hideManufacturer ? null : <TableHead>Manufacturer</TableHead>}
              <TableHead className="w-14" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, i) => {
              const hasProduct = line.productId.length > 0;
              return (
                <TableRow key={i}>
                  <TableCell>
                    <Select
                      value={line.productId}
                      items={productItems}
                      onValueChange={(v) => {
                        if (v) onUpdateLine(i, { productId: v });
                      }}
                    >
                      <SelectTrigger className="w-full min-w-[160px]">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      className="w-24"
                      disabled={!hasProduct}
                      value={hasProduct ? line.quantity : ""}
                      placeholder={hasProduct ? undefined : "—"}
                      onChange={(e) =>
                        onUpdateLine(i, {
                          quantity: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </TableCell>
                  {hideManufacturer ? null : (
                    <TableCell>
                      <Select
                        value={line.manufacturerId}
                        items={manufacturerItems}
                        disabled={!hasProduct}
                        onValueChange={(v) => {
                          if (v) onUpdateLine(i, { manufacturerId: v });
                        }}
                      >
                        <SelectTrigger className="w-full min-w-[140px]">
                          <SelectValue placeholder="Manufacturer" />
                        </SelectTrigger>
                        <SelectContent>
                          {manufacturerIdList.map((mid) => {
                            const m = manufacturers.find((x) => x.id === mid);
                            return (
                              <SelectItem key={mid} value={mid}>
                                {m?.name ?? mid}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )}
                  <TableCell>
                    {hasProduct ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveLine(i)}>
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
