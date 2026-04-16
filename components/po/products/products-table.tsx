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
import { Pencil, Trash2 } from "lucide-react";
import { PriceView } from "@/components/ui/price-view";

type Props = {
  rows: Product[];
  isPending: boolean;
  onEdit: (row: Product) => void;
  onDelete: (row: Product) => void;
};

export function ProductsTable({ rows, isPending, onEdit, onDelete }: Props) {
  const confirm = useConfirm();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Image</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead className="text-end">Cost</TableHead>
          <TableHead className="text-end">Price</TableHead>
          <TableHead className="w-14">Barcode</TableHead>
          <TableHead>Packaging</TableHead>
          <TableHead>Default Mfr.</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Verified</TableHead>
          <TableHead className="w-[120px] text-end">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableRow>
            <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
              Loading…
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
              No products yet.
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
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="font-mono text-xs">{row.sku}</TableCell>
              <TableCell className="text-end text-muted-foreground">
                <PriceView value={row.cost} />
              </TableCell>
              <TableCell className="text-end text-muted-foreground">
                <PriceView value={row.price} />
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
              <TableCell>{row.defaultManufacturer.name}</TableCell>
              <TableCell>{row.category?.name ?? <span className="text-muted-foreground">None</span>}</TableCell>
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
