"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Search } from "lucide-react";
import type { SaleChannelProduct } from "@/lib/types/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PriceView } from "@/components/ui/price-view";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import {
  readBrowserStorageEventItem,
  readBrowserStorageItem,
  writeBrowserStorageItem,
} from "./browser-storage";

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

function normalizeSearchValue(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  return String(value).toLowerCase();
}

function productSearchFields(product: SaleChannelProduct) {
  return [
    product.name,
    product.sku,
    product.upcGtin,
    product.collection?.name,
    product.category?.name,
    product.description,
    product.editionStatus,
    product.msrp,
    product.map,
    product.wholesalePrice,
    product.moq,
    product.stockCount,
    product.quantityPerCarton,
  ]
    .map(normalizeSearchValue)
    .filter((value): value is string => value != null);
}

function parseSearchTokens(query: string) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function productMatchesSearch(product: SaleChannelProduct, tokens: string[]) {
  if (tokens.length === 0) return true;

  const fields = productSearchFields(product);
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}

const ESTIMATED_PRODUCT_ROW_HEIGHT = 180;
const PRODUCT_LIST_INITIAL_HEIGHT = 544;
const DEFAULT_PICKER_STORAGE_KEY = "po-new-order-product-picker-selection";

function uniqueProductIds(values: unknown[]) {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  );
}

function productIdsFromStoredValue(raw: string | null) {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? uniqueProductIds(parsed) : [];
  } catch {
    return [];
  }
}

function readStoredProductIds(storageKey: string) {
  return productIdsFromStoredValue(readBrowserStorageItem(storageKey));
}

function writeStoredProductIds(storageKey: string, productIds: Iterable<string>) {
  writeBrowserStorageItem(storageKey, JSON.stringify(Array.from(new Set(productIds))));
}

function sameProductIdSet(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function isOutOfStock(product: SaleChannelProduct) {
  return product.stockCount != null && product.stockCount <= 0;
}

function stockSortRank(product: SaleChannelProduct) {
  if (product.stockCount == null) return 1;
  return isOutOfStock(product) ? 2 : 0;
}

function stockBadge(product: SaleChannelProduct) {
  if (product.stockCount == null) return <Badge variant="outline">Stock unknown</Badge>;
  if (isOutOfStock(product)) {
    return (
      <Badge
        variant="secondary"
        className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        Out of stock
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200"
    >
      In stock
    </Badge>
  );
}

function ProductImage({
  product,
  className,
}: {
  product: SaleChannelProduct;
  className?: string;
}) {
  const [imageLinkFailed, setImageLinkFailed] = useState(false);
  const canShowImageLink = canOpenLink(product.imageLink) && !imageLinkFailed;

  if (product.imageKey) {
    return (
      <StorageObjectImage
        reference={product.imageKey}
        alt={product.name}
        className={cn("size-20 shrink-0 bg-muted/30", className)}
        objectFit="cover"
        previewWidth={256}
        fallback="No image"
      />
    );
  }

  return (
    <div
      className={cn(
        "relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30 text-center text-xs text-muted-foreground",
        className,
      )}
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

function ProductPickerRow({
  product,
  alreadyAdded,
  checked,
  onToggle,
}: {
  product: SaleChannelProduct;
  alreadyAdded: boolean;
  checked: boolean;
  onToggle: (productId: string, checked: boolean) => void;
}) {
  const checkboxId = `product-picker-${product.id}`;

  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        "flex gap-3 rounded-lg border border-border/80 p-3 transition-colors",
        alreadyAdded
          ? "cursor-not-allowed bg-muted/40 opacity-75"
          : "cursor-pointer hover:border-primary/30 hover:bg-muted/30",
        checked && "border-primary/50 bg-primary/5",
      )}
    >
      <Checkbox
        id={checkboxId}
        checked={checked}
        disabled={alreadyAdded}
        onCheckedChange={(value) => onToggle(product.id, value === true)}
        className="mt-1 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row">
        <ProductImage product={product} className="size-16 sm:size-20" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium leading-tight">{product.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  {product.sku}
                </Badge>
                {product.collection?.name ? (
                  <Badge variant="secondary">{product.collection.name}</Badge>
                ) : null}
                {stockBadge(product)}
                {alreadyAdded ? <Badge variant="outline">Added</Badge> : null}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Wholesale</div>
              <PriceView value={product.wholesalePrice} className="font-medium" />
            </div>
          </div>

          <div className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <div>
              UPC/GTIN:{" "}
              <span className="text-foreground">{emptyValue(product.upcGtin)}</span>
            </div>
            <div>
              Category:{" "}
              <span className="text-foreground">{product.category?.name ?? "None"}</span>
            </div>
            <div>
              MSRP: <PriceView value={product.msrp} className="text-foreground" />
            </div>
            <div>
              MAP: <PriceView value={product.map} className="text-foreground" />
            </div>
            <div>
              MOQ: <span className="text-foreground">{emptyValue(product.moq)}</span>
            </div>
            <div>
              Carton qty:{" "}
              <span className="text-foreground">
                {emptyValue(product.quantityPerCarton)}
              </span>
            </div>
            <div>
              Stock:{" "}
              <span className="text-foreground">{emptyValue(product.stockCount)}</span>
            </div>
            {!product.orderByDate ? null : <div>
              Order by Date:{" "}
              <span className="text-foreground">{formatDate(product.orderByDate)}</span>
            </div>}
          </div>

          {product.description ? (
            <p className="max-h-10 overflow-hidden text-xs text-muted-foreground">
              {product.description}
            </p>
          ) : null}
        </div>
      </div>
    </label>
  );
}

export function ProductPickerDialog({
  open,
  onOpenChange,
  products,
  selectedProductIds,
  storageKey,
  onAddProducts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: SaleChannelProduct[];
  selectedProductIds: Set<string>;
  storageKey?: string | null;
  onAddProducts: (productIds: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [checkedProductIds, setCheckedProductIds] = useState<Set<string>>(() => new Set());
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const productListRef = useRef<HTMLDivElement>(null);
  const checkedProductStorageKey = storageKey ?? DEFAULT_PICKER_STORAGE_KEY;
  const productIdSet = useMemo(
    () => new Set(products.map((product) => product.id)),
    [products],
  );

  const visibleProducts = useMemo(() => {
    const searchTokens = parseSearchTokens(query);
    const matchingProducts = searchTokens.length
      ? products.filter((product) => productMatchesSearch(product, searchTokens))
      : products;

    return [...matchingProducts].sort(
      (left, right) => stockSortRank(left) - stockSortRank(right),
    );
  }, [products, query]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const productVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: visibleProducts.length,
    getScrollElement: () => productListRef.current,
    estimateSize: () => ESTIMATED_PRODUCT_ROW_HEIGHT,
    initialRect: { width: 0, height: PRODUCT_LIST_INITIAL_HEIGHT },
    gap: 12,
    overscan: 5,
    getItemKey: (index) => visibleProducts[index]?.id ?? index,
  });

  const addableCheckedProductIds = useMemo(
    () =>
      Array.from(checkedProductIds).filter(
        (productId) => productIdSet.has(productId) && !selectedProductIds.has(productId),
      ),
    [checkedProductIds, productIdSet, selectedProductIds],
  );
  const checkedCount = addableCheckedProductIds.length;

  useEffect(() => {
    productVirtualizer.scrollToOffset(0);
  }, [productVirtualizer, query]);

  useEffect(() => {
    if (!open) return;

    const storedProductIds = readStoredProductIds(checkedProductStorageKey);
    setCheckedProductIds(
      new Set(
        storedProductIds.filter(
          (productId) =>
            !selectedProductIds.has(productId) &&
            (products.length === 0 || productIdSet.has(productId)),
        ),
      ),
    );
    setLoadedStorageKey(checkedProductStorageKey);
  }, [checkedProductStorageKey, open, productIdSet, products.length, selectedProductIds]);

  useEffect(() => {
    setCheckedProductIds((current) => {
      const next = new Set(
        Array.from(current).filter(
          (productId) =>
            !selectedProductIds.has(productId) &&
            (products.length === 0 || productIdSet.has(productId)),
        ),
      );
      return sameProductIdSet(current, next) ? current : next;
    });
  }, [productIdSet, products.length, selectedProductIds]);

  useEffect(() => {
    if (loadedStorageKey !== checkedProductStorageKey) return;
    writeStoredProductIds(checkedProductStorageKey, checkedProductIds);
  }, [checkedProductIds, checkedProductStorageKey, loadedStorageKey]);

  useEffect(() => {
    if (!open || loadedStorageKey !== checkedProductStorageKey) return;

    function handleStorage(event: StorageEvent) {
      if (
        event.storageArea !== window.localStorage ||
        event.key !== checkedProductStorageKey
      ) {
        return;
      }
      setCheckedProductIds(
        new Set(
          productIdsFromStoredValue(readBrowserStorageEventItem(event)).filter(
            (productId) =>
              !selectedProductIds.has(productId) &&
              (products.length === 0 || productIdSet.has(productId)),
          ),
        ),
      );
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [
    checkedProductStorageKey,
    loadedStorageKey,
    open,
    productIdSet,
    products.length,
    selectedProductIds,
  ]);

  function toggleProduct(productId: string, checked: boolean) {
    if (selectedProductIds.has(productId)) return;
    setCheckedProductIds((current) => {
      const next = new Set(current);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  function handleAddProducts() {
    const productIds = addableCheckedProductIds;
    if (productIds.length === 0) return;
    const addedProductIds = new Set(productIds);
    const remainingProductIds = new Set(
      Array.from(checkedProductIds).filter((productId) => !addedProductIds.has(productId)),
    );
    setCheckedProductIds(remainingProductIds);
    writeStoredProductIds(checkedProductStorageKey, remainingProductIds);
    onAddProducts(productIds);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="4xl">
        <DialogHeader>
          <DialogTitle>Product search</DialogTitle>
          <DialogDescription>
            Review catalog details and add selected products to the order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, SKU, UPC, category, collection..."
              className="pl-8"
            />
          </div>

          {visibleProducts.length === 0 ? (
            <div className="rounded-lg border border-border/80 p-8 text-center text-sm text-muted-foreground">
              No products match your search.
            </div>
          ) : (
            <div
              ref={productListRef}
              className="h-[min(52dvh,34rem)] pt-1 overflow-y-auto pr-1"
            >
              <div
                role="list"
                aria-label="Product search results"
                className="relative w-full"
                style={{ height: `${productVirtualizer.getTotalSize()}px` }}
              >
                {productVirtualizer.getVirtualItems().map((virtualProduct) => {
                  const product = visibleProducts[virtualProduct.index];
                  if (!product) return null;

                  const alreadyAdded = selectedProductIds.has(product.id);
                  const checked = checkedProductIds.has(product.id);

                  return (
                    <div
                      key={virtualProduct.key}
                      ref={productVirtualizer.measureElement}
                      data-index={virtualProduct.index}
                      role="listitem"
                      className="absolute left-0 top-0 w-full"
                      style={{ transform: `translateY(${virtualProduct.start}px)` }}
                    >
                      <ProductPickerRow
                        product={product}
                        alreadyAdded={alreadyAdded}
                        checked={checked}
                        onToggle={toggleProduct}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={checkedCount === 0} onClick={handleAddProducts}>
            <Plus className="size-4" />
            {checkedCount === 1
              ? "Add 1 product"
              : checkedCount > 1
                ? `Add ${checkedCount} products`
                : "Add products"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
