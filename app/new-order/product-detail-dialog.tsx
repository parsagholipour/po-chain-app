"use client";

import { useState } from "react";
import type { SaleChannelLocation, SaleChannelProduct } from "@/lib/types/api";
import { productEditingStatusLabels } from "@/lib/product-editing-status";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PriceView } from "@/components/ui/price-view";
import { StorageObjectImage } from "@/components/ui/storage-object-image";

export type OrderLineQuantity = {
  location: SaleChannelLocation;
  quantity: number;
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
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function canOpenLink(value: string) {
  return /^https?:\/\//i.test(value);
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function ProductDetailImage({ product }: { product: SaleChannelProduct }) {
  const [imageLinkFailed, setImageLinkFailed] = useState(false);
  const canShowImageLink = canOpenLink(product.imageLink) && !imageLinkFailed;

  if (product.imageKey) {
    return (
      <StorageObjectImage
        reference={product.imageKey}
        alt={product.name}
        className="size-28 shrink-0 bg-muted/30 sm:size-32"
        objectFit="cover"
        previewWidth={320}
        fallback="No image"
      />
    );
  }

  return (
    <div
      className="relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30 text-center text-xs text-muted-foreground sm:size-32"
    >
      {canShowImageLink ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageLink}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => setImageLinkFailed(true)}
        />
      ) : (
        "No image"
      )}
    </div>
  );
}

function stockLabel(product: SaleChannelProduct) {
  if (product.stockCount == null) return "Stock unknown";
  if (product.stockCount <= 0) return "Out of stock";
  return `In stock (${product.stockCount})`;
}

export function ProductDetailDialog({
  open,
  onOpenChange,
  product,
  quantities,
  rowTotal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: SaleChannelProduct | null;
  quantities: OrderLineQuantity[];
  rowTotal: number | null;
}) {
  if (!product) return null;

  const lineQuantityTotal = quantities.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>Product details and quantities on this order line.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <ProductDetailImage product={product} />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  {product.sku}
                </Badge>
                {product.collection?.name ? (
                  <Badge variant="secondary">{product.collection.name}</Badge>
                ) : null}
                {product.category?.name ? (
                  <Badge variant="outline">{product.category.name}</Badge>
                ) : null}
                <Badge variant="outline">{stockLabel(product)}</Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Wholesale price">
                  <PriceView value={product.wholesalePrice} className="font-medium" />
                </DetailField>
                <DetailField label="MSRP">
                  <PriceView value={product.msrp} />
                </DetailField>
                <DetailField label="MAP">
                  <PriceView value={product.map} />
                </DetailField>
                <DetailField label="UPC / GTIN">{emptyValue(product.upcGtin)}</DetailField>
                <DetailField label="MOQ">{emptyValue(product.moq)}</DetailField>
                <DetailField label="Items per carton">
                  {emptyValue(product.quantityPerCarton)}
                </DetailField>
                <DetailField label="Edition status">
                  {productEditingStatusLabels[product.editionStatus]}
                </DetailField>
                <DetailField label="Order by date">{formatDate(product.orderByDate)}</DetailField>
                <DetailField label="Release / ships from">
                  {formatDate(product.releaseDateShipsFrom)}
                </DetailField>
              </div>
            </div>
          </div>

          {product.description ? (
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Description</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {product.description}
              </p>
            </div>
          ) : null}

          <div className="space-y-3 rounded-lg border border-border/80 p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h3 className="text-sm font-medium">Order line quantities</h3>
              <div className="text-sm text-muted-foreground">
                Line total:{" "}
                <PriceView value={rowTotal} className="font-medium text-foreground" />
              </div>
            </div>

            {quantities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add a location to enter quantities.</p>
            ) : (
              <ul className="divide-y divide-border/70 rounded-md border border-border/80">
                {quantities.map(({ location, quantity }) => (
                  <li
                    key={location.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{location.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[location.addressLine1, location.city, location.country]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums font-medium",
                        quantity === 0 && "text-muted-foreground",
                      )}
                    >
                      {quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {quantities.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {lineQuantityTotal} total unit{lineQuantityTotal === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
