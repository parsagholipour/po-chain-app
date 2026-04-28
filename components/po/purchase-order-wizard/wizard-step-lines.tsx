"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
import { PoLinesSelectTable } from "@/components/po/purchase-order-wizard/po-lines-select-table";
import { findLinesMissingProductAssets } from "@/lib/mo-product-assets";
import { cn } from "@/lib/utils";

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

export type LineDraftProductAssetIssue = {
  key: string;
  productId: string;
  productName: string;
  sku: string;
  missingFields: string[];
};

export function lineDraftProductAssetIssues(
  lines: LineDraft[],
  products: Product[],
): LineDraftProductAssetIssue[] {
  return filledLines(lines).flatMap((line, i) => {
    const product = products.find((p) => p.id === line.productId);
    if (!product) return [];
    const [missingLine] = findLinesMissingProductAssets([{ product }]);
    if (!missingLine) return [];
    return [
      {
        key: `${line.productId}-${i}`,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        missingFields: missingLine.missingFields,
      },
    ];
  });
}

function ProductAssetIssueList({
  issues,
}: {
  issues: LineDraftProductAssetIssue[];
}) {
  if (issues.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3">
      <p className="text-xs font-medium text-destructive">
        Selected products need barcode, packaging, and verified status before creating the order:
      </p>
      <ul className="space-y-1.5 text-xs text-destructive/80">
        {issues.map((issue) => (
          <li
            key={issue.key}
            className="flex items-center gap-2 rounded-md border border-destructive/20 bg-background/70 p-2"
          >
            <span className="min-w-0 flex-1">
              <span className="font-mono">{issue.sku}</span>
              {" - "}
              <span>{issue.productName}</span>
              <span className="text-destructive/70">
                {" "}
                ({issue.missingFields.join(" and ")})
              </span>
            </span>
            <Link
              href={`/products?id=${issue.productId}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-sm" }),
                "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive",
              )}
              aria-label={`Open product ${issue.productName}`}
              title="Open product"
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
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
  /** When true, empty `products` means still loading — do not show the empty catalog message. */
  isPending?: boolean;
};

export function WizardStepLines({
  products,
  manufacturers,
  manufacturerIdList,
  lines,
  onUpdateLine,
  onRemoveLine,
  hideManufacturer = false,
  isPending = false,
}: Props) {
  const productSelectItems = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.sku})`,
        keywords: p.sku,
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
  const productAssetIssues = lineDraftProductAssetIssues(lines, products);

  if (hideManufacturer) {
    if (isPending) {
      return <p className="text-sm text-muted-foreground">Loading…</p>;
    }
    if (products.length === 0) {
      return <p className="text-sm text-muted-foreground">Add products first.</p>;
    }
    return (
      <div className="space-y-3">
        <PoLinesSelectTable
          selectColumnLabel="Product"
          selectPlaceholder="Select product"
          emptyItemsMessage="Add products first."
          items={productSelectItems}
          rows={lines.map((l) => ({ entityId: l.productId, quantity: l.quantity }))}
          onUpdateRow={(i, patch) => {
            const p: Partial<LineDraft> = {};
            if (patch.entityId !== undefined) p.productId = patch.entityId;
            if (patch.quantity !== undefined) p.quantity = patch.quantity;
            onUpdateLine(i, p);
          }}
          onRemoveRow={onRemoveLine}
        />
        <ProductAssetIssueList issues={productAssetIssues} />
      </div>
    );
  }

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

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
              <TableHead>Manufacturer</TableHead>
              <TableHead className="w-14" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, i) => {
              const hasProduct = line.productId.length > 0;
              return (
                <TableRow key={i}>
                  <TableCell>
                    <SearchableSelect
                      className="w-full min-w-[160px]"
                      items={productSelectItems}
                      value={line.productId}
                      placeholder="Select product"
                      onValueChange={(productId) => onUpdateLine(i, { productId })}
                    />
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
      <ProductAssetIssueList issues={productAssetIssues} />
    </div>
  );
}
