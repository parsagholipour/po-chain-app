"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
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
  if (Number.isNaN(date.getTime())) return <span className="text-muted-foreground">None</span>;
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Image</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>UPC/GTIN</TableHead>
          <TableHead className="text-end">Cost</TableHead>
          <TableHead className="text-end">Price</TableHead>
          <TableHead className="text-end">MAP</TableHead>
          <TableHead className="text-end">MSRP</TableHead>
          <TableHead className="text-end">MOP</TableHead>
          <TableHead className="text-end">Carton Qty</TableHead>
          <TableHead>Order By</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-end">Stock</TableHead>
          <TableHead>Image Link</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="w-14">Barcode</TableHead>
          <TableHead>Packaging</TableHead>
          <TableHead>Default Mfr.</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Collection</TableHead>
          <TableHead>Verified</TableHead>
          <TableHead className="w-[120px] text-end">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableRow>
            <TableCell colSpan={23} className="h-24 text-center text-muted-foreground">
              Loading...
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={23} className="h-24 text-center text-muted-foreground">
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
              <TableCell className="font-mono text-xs">{emptyValue(row.upcGtin)}</TableCell>
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
              <TableCell className="text-end">{emptyValue(row.mop)}</TableCell>
              <TableCell className="text-end">{emptyValue(row.quantityPerCarton)}</TableCell>
              <TableCell>{formatDate(row.orderByDate)}</TableCell>
              <TableCell>{productEditingStatusLabels[row.editingStatus]}</TableCell>
              <TableCell className="text-end">{emptyValue(row.stockCount)}</TableCell>
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
              <TableCell className="max-w-56 truncate" title={row.description ?? undefined}>
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
                <StorageObjectLink reference={row.packagingKey} label="Open file" />
              </TableCell>
              <TableCell className="max-w-48 truncate" title={row.defaultManufacturer.name}>
                {row.defaultManufacturer.name}
              </TableCell>
              <TableCell className="max-w-44 truncate" title={row.category?.name ?? undefined}>
                {row.category?.name ?? <span className="text-muted-foreground">None</span>}
              </TableCell>
              <TableCell className="max-w-44 truncate" title={row.type?.name ?? undefined}>
                {row.type?.name ?? <span className="text-muted-foreground">None</span>}
              </TableCell>
              <TableCell className="max-w-44 truncate" title={row.collection?.name ?? undefined}>
                {row.collection?.name ?? <span className="text-muted-foreground">None</span>}
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
    </Table>
  );
}
