"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PriceView } from "@/components/ui/price-view";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SaleChannelProduct } from "@/lib/types/api";
import { productEditingStatusLabels } from "@/lib/product-editing-status";

type Props = {
  rows: SaleChannelProduct[];
  isPending: boolean;
  emptyMessage?: string;
};

const columnCount = 17;

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
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function canOpenLink(value: string) {
  return /^https?:\/\//i.test(value);
}

function StockStatus({ stockCount }: { stockCount: number | null }) {
  if (stockCount == null) {
    return <Badge variant="outline">Unknown</Badge>;
  }

  if (stockCount <= 0) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Out of stock
      </Badge>
    );
  }

  return <Badge variant="default">In stock</Badge>;
}

function ImageLinkCell({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">None</span>;

  if (!canOpenLink(value)) {
    return <span title={value}>{value}</span>;
  }

  return (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1 truncate text-primary underline-offset-4 hover:underline"
      title={value}
    >
      <span className="truncate">{value}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

export function SaleChannelProductsTable({
  rows,
  isPending,
  emptyMessage = "No products yet.",
}: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Product Name</TableHead>
          <TableHead>UPC/GTIN</TableHead>
          <TableHead>Collection</TableHead>
          <TableHead className="text-end">MSRP</TableHead>
          <TableHead className="text-end">MAP</TableHead>
          <TableHead className="text-end">Wholesale Price</TableHead>
          <TableHead className="text-end">MOQ</TableHead>
          <TableHead>Image Link</TableHead>
          <TableHead className="w-28">Barcode Image</TableHead>
          <TableHead>Stock Status</TableHead>
          <TableHead className="text-end">Stock Count</TableHead>
          <TableHead className="text-end">Qty/Carton</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Order By Date</TableHead>
          <TableHead>Release Date (Ships From)</TableHead>
          <TableHead>Edition Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableRow>
            <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
              Loading...
            </TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.sku}</TableCell>
              <TableCell className="min-w-56 max-w-72 whitespace-normal font-medium leading-snug">
                {row.name}
              </TableCell>
              <TableCell className="font-mono text-xs">{emptyValue(row.upcGtin)}</TableCell>
              <TableCell className="max-w-44 truncate" title={row.collection?.name ?? undefined}>
                {row.collection?.name ?? <span className="text-muted-foreground">None</span>}
              </TableCell>
              <TableCell className="text-end text-muted-foreground">
                <PriceView value={row.msrp} />
              </TableCell>
              <TableCell className="text-end text-muted-foreground">
                <PriceView value={row.map} />
              </TableCell>
              <TableCell className="text-end">
                <PriceView value={row.wholesalePrice} />
              </TableCell>
              <TableCell className="text-end">{emptyValue(row.moq)}</TableCell>
              <TableCell className="max-w-56 truncate">
                <ImageLinkCell value={row.imageLink} />
              </TableCell>
              <TableCell>
                <StorageObjectImage
                  reference={row.barcodeKey}
                  className="h-10 w-24 shrink-0"
                  aspectFallback="3 / 1"
                  objectFit="contain"
                  previewWidth={256}
                />
              </TableCell>
              <TableCell>
                <StockStatus stockCount={row.stockCount} />
              </TableCell>
              <TableCell className="text-end">{emptyValue(row.stockCount)}</TableCell>
              <TableCell className="text-end">{emptyValue(row.quantityPerCarton)}</TableCell>
              <TableCell className="max-w-72 truncate" title={row.description ?? undefined}>
                {emptyValue(row.description)}
              </TableCell>
              <TableCell>{formatDate(row.orderByDate)}</TableCell>
              <TableCell>{formatDate(row.releaseDateShipsFrom)}</TableCell>
              <TableCell>{productEditingStatusLabels[row.editionStatus]}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
