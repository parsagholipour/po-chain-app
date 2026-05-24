"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, Eye, Loader2, MapPinned, Pencil, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { useWizardDocumentUpload } from "@/lib/use-wizard-document-upload";
import { moneyToCents } from "@/lib/distributor-orders/money";
import type { SaleChannel, SaleChannelLocation, SaleChannelProduct } from "@/lib/types/api";
import { cn } from "@/lib/utils";
import { documentDisplayName } from "@/components/po/purchase-order-wizard/wizard-step-basics";
import { SaleChannelLocationUpsertDialog } from "@/components/po/sale-channels/sale-channel-location-upsert-dialog";
import type { SaleChannelLocationFormValues } from "@/components/po/sale-channels/sale-channel-location-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DocumentDownloadLink } from "@/components/ui/document-download-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceView } from "@/components/ui/price-view";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductDetailDialog } from "./product-detail-dialog";
import { ProductPickerDialog } from "./product-picker-dialog";
import {
  readBrowserStorageEventItem,
  readBrowserStorageItem,
  writeBrowserStorageItem,
} from "./browser-storage";

type OrderRow = {
  id: string;
  productId: string;
  quantities: Record<string, number>;
};

type DraftCreateResponse = {
  invoice: {
    id: string;
    invoiceNumber: string;
    paymentStatus: string;
    currency: string;
    totalAmount: string | number;
  };
};

type DirectOrderCreateResponse = {
  purchaseOrders: Array<{
    id: string;
    number: number;
    name: string;
    status: string;
  }>;
  convertedPurchaseOrderIds: string[];
};

type CheckoutResponse = {
  checkoutUrl: string;
  paymentAttemptId: string;
  provider: string;
};

type PlaceOrderResponse = {
  invoiceId: string;
  convertedPurchaseOrderIds: string[];
};

type OrderSubmitResponse =
  | {
      action: "checkout";
      checkoutUrl: string;
    }
  | {
      action: "placed";
      purchaseOrderIds: string[];
    };

type BackOrderSubmitMode = {
  lines: BackOrderDraftLine[];
};

type BackOrderReview = {
  lines: BackOrderDraftLine[];
  visibleLineKeys: string[];
};

type BackOrderDraftLine = {
  rowId: string;
  productId: string;
  locationId: string;
  quantity: number;
  backOrder: boolean;
};

type BackOrderReviewLine = BackOrderDraftLine & {
  key: string;
  product: SaleChannelProduct;
  location: SaleChannelLocation;
  availableQuantity: number;
  unavailableQuantity: number;
  stockCount: number;
  isShort: boolean;
};

const NEW_ORDER_SELECTED_PRODUCTS_STORAGE_PREFIX = "po-new-order-selected-products";
const PRODUCT_PICKER_SELECTION_STORAGE_PREFIX = "po-new-order-product-picker-selection";

function selectedProductsStorageKey(saleChannelId: string) {
  return `${NEW_ORDER_SELECTED_PRODUCTS_STORAGE_PREFIX}:${saleChannelId}`;
}

function productPickerStorageKey(saleChannelId: string) {
  return `${PRODUCT_PICKER_SELECTION_STORAGE_PREFIX}:${saleChannelId}`;
}

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

function newRow(id: string): OrderRow {
  return {
    id,
    productId: "",
    quantities: {},
  };
}

function nextOrderRowId(rows: OrderRow[]) {
  const existingIds = new Set(rows.map((row) => row.id));
  let rowNumber = rows.length + 1;
  let id = `row-${rowNumber}`;

  while (existingIds.has(id)) {
    rowNumber += 1;
    id = `row-${rowNumber}`;
  }

  return id;
}

function ensureTrailingBlankRow(rows: OrderRow[]) {
  const lastRow = rows[rows.length - 1];
  if (!lastRow || lastRow.productId.length > 0) {
    return [...rows, newRow(nextOrderRowId(rows))];
  }
  return rows;
}

function rowsFromStoredProductIds(
  productIds: string[],
  productById: Map<string, SaleChannelProduct>,
  currentRows: OrderRow[] = [],
) {
  const currentRowByProductId = new Map(
    currentRows
      .filter((row) => row.productId.length > 0)
      .map((row) => [row.productId, row]),
  );
  const rows = productIds
    .filter((productId) => productById.has(productId))
    .map(
      (productId) =>
        currentRowByProductId.get(productId) ?? {
          ...newRow(`product:${productId}`),
          productId,
        },
    );

  return ensureTrailingBlankRow(rows);
}

function quantityValue(row: OrderRow, locationId: string) {
  return row.quantities[locationId] ?? 0;
}

function setQuantity(row: OrderRow, locationId: string, quantity: number): OrderRow {
  return {
    ...row,
    quantities: {
      ...row.quantities,
      [locationId]: quantity,
    },
  };
}

function productPriceCents(product: SaleChannelProduct | undefined) {
  return product ? moneyToCents(product.wholesalePrice) : null;
}

function canShowProductImageLink(value: string) {
  return /^https?:\/\//i.test(value);
}

function OrderProductImage({ product }: { product: SaleChannelProduct }) {
  const [imageLinkFailed, setImageLinkFailed] = useState(false);

  if (product.imageKey) {
    return (
      <StorageObjectImage
        reference={product.imageKey}
        alt={product.name}
        className="size-12 shrink-0 bg-muted/30"
        objectFit="cover"
        previewWidth={160}
        fallback={null}
      />
    );
  }

  if (!canShowProductImageLink(product.imageLink) || imageLinkFailed) return null;

  return (
    <div className="relative size-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.imageLink}
        alt={product.name}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
        onError={() => setImageLinkFailed(true)}
      />
    </div>
  );
}

function rowQuantityTotal(row: OrderRow) {
  return Object.values(row.quantities).reduce((sum, qty) => sum + Math.max(0, qty), 0);
}

function backOrderLineKey(rowId: string, locationId: string) {
  return `${rowId}:${locationId}`;
}

function productMoq(product: SaleChannelProduct | undefined) {
  const moq = product?.moq;
  if (moq == null || moq <= 0) return null;
  return moq;
}

function productItemsPerCarton(product: SaleChannelProduct | undefined) {
  const itemsPerCarton = product?.quantityPerCarton;
  if (itemsPerCarton == null || itemsPerCarton <= 0) return null;
  return itemsPerCarton;
}

function AvailableStockCell({ product }: { product: SaleChannelProduct | undefined }) {
  if (!product) return null;

  if (product.stockCount == null) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span
      className={cn(
        "tabular-nums",
        product.stockCount <= 0 && "text-destructive",
      )}
    >
      {product.stockCount}
    </span>
  );
}

function isQuantityMoqValid(quantity: number, moq: number | null) {
  if (quantity <= 0) return true;
  if (moq == null) return true;
  return quantity >= moq;
}

function isQuantityCartonValid(quantity: number, itemsPerCarton: number | null) {
  if (quantity <= 0) return true;
  if (itemsPerCarton == null) return true;
  return quantity % itemsPerCarton === 0;
}

function snapQuantityToCarton(quantity: number, itemsPerCarton: number | null) {
  if (quantity <= 0 || itemsPerCarton == null) return Math.max(0, quantity);
  return Math.round(quantity / itemsPerCarton) * itemsPerCarton;
}

function sessionDestinationKey(locationId: string) {
  return `session:${locationId}`;
}

function sessionLocationFromValues({
  id,
  saleChannelId,
  values,
  previous,
}: {
  id: string;
  saleChannelId: string;
  values: SaleChannelLocationFormValues;
  previous?: SaleChannelLocation | null;
}): SaleChannelLocation {
  const now = new Date().toISOString();
  return {
    id,
    name: values.name,
    recipientName: values.recipientName,
    companyName: values.companyName ?? null,
    phoneNumber: values.phoneNumber ?? null,
    email: values.email ?? null,
    addressLine1: values.addressLine1,
    addressLine2: values.addressLine2 ?? null,
    city: values.city,
    stateProvince: values.stateProvince ?? null,
    postalCode: values.postalCode ?? null,
    country: values.country,
    shippingNotes: values.shippingNotes ?? null,
    saleChannelId,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

function isSessionLocation(value: unknown): value is SaleChannelLocation {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SaleChannelLocation>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.recipientName === "string" &&
    typeof row.addressLine1 === "string" &&
    typeof row.city === "string" &&
    typeof row.country === "string" &&
    typeof row.saleChannelId === "string"
  );
}

function sessionLocationsFromStoredValue(raw: string | null) {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isSessionLocation) : [];
  } catch {
    return [];
  }
}

function LocationPurchaseOrderDetails({
  location,
  purchaseOrderName,
  onPurchaseOrderNameChange,
  onDocumentChange,
  onUploadingChange,
}: {
  location: SaleChannelLocation;
  purchaseOrderName: string;
  onPurchaseOrderNameChange: (locationId: string, name: string) => void;
  onDocumentChange: (locationId: string, documentKey: string | null) => void;
  onUploadingChange: (locationId: string, uploading: boolean) => void;
}) {
  const {
    documentKey,
    docFile,
    isDocUploading,
    onDocFileChange,
    onRetryDocUpload,
  } = useWizardDocumentUpload("new-orders");
  const displayName = documentDisplayName(documentKey, docFile);

  useEffect(() => {
    onDocumentChange(location.id, documentKey);
  }, [documentKey, location.id, onDocumentChange]);

  useEffect(() => {
    onUploadingChange(location.id, isDocUploading);
    return () => onUploadingChange(location.id, false);
  }, [isDocUploading, location.id, onUploadingChange]);

  return (
    <div className="rounded-lg border border-border/80 bg-background p-3">
      <div className="space-y-3">
        <div className="min-w-0">
          <p className="font-medium">{location.name}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`location-po-name-${location.id}`}>PO name (optional)</Label>
          <Input
            id={`location-po-name-${location.id}`}
            value={purchaseOrderName}
            maxLength={120}
            onChange={(event) => onPurchaseOrderNameChange(location.id, event.target.value)}
            placeholder={`e.g. ${location.name} replenishment`}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`location-document-${location.id}`}>Document (optional)</Label>
          <Input
            id={`location-document-${location.id}`}
            type="file"
            disabled={isDocUploading}
            onChange={(event) => onDocFileChange(event.target.files?.[0] ?? null)}
          />
          {docFile && !documentKey && isDocUploading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Uploading...
            </p>
          ) : null}
          {docFile && !documentKey && !isDocUploading ? (
            <Button type="button" variant="secondary" size="sm" onClick={onRetryDocUpload}>
              Retry upload
            </Button>
          ) : null}
          {displayName ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">File:</span>
              <span className="break-all font-medium">{displayName}</span>
              {documentKey ? (
                <DocumentDownloadLink
                  documentKey={documentKey}
                  fileName={displayName}
                  fallback={null}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NewOrderView() {
  const [rows, setRows] = useState<OrderRow[]>(() => [newRow("row-1")]);
  const [purchaseOrderNamesByLocationId, setPurchaseOrderNamesByLocationId] =
    useState<Record<string, string>>({});
  const [documentsByLocationId, setDocumentsByLocationId] = useState<Record<string, string | null>>({});
  const [uploadingByLocationId, setUploadingByLocationId] = useState<Record<string, boolean>>({});
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productPickerRowId, setProductPickerRowId] = useState<string | null>(null);
  const [productDetailRowId, setProductDetailRowId] = useState<string | null>(null);
  const [sessionLocations, setSessionLocations] = useState<SaleChannelLocation[]>([]);
  const [loadedSessionLocationKey, setLoadedSessionLocationKey] = useState<string | null>(null);
  const [loadedSessionProductSelectionKey, setLoadedSessionProductSelectionKey] =
    useState<string | null>(null);
  const [sessionLocationOpen, setSessionLocationOpen] = useState(false);
  const [editingSessionLocation, setEditingSessionLocation] = useState<SaleChannelLocation | null>(null);
  const [backOrderReview, setBackOrderReview] = useState<BackOrderReview | null>(null);

  const { data: saleChannels = [], isLoading: saleChannelsLoading } = useQuery({
    queryKey: ["sale-channels"],
    queryFn: async () => {
      const { data } = await api.get<SaleChannel[]>("/api/sale-channels");
      return data;
    },
  });

  const orderSaleChannel =
    saleChannels.find((channel) => channel.type === "store" || channel.type === "distributor") ?? null;
  const isStoreSaleChannel = orderSaleChannel?.type === "store";
  const sessionLocationStorageKey =
    orderSaleChannel && isStoreSaleChannel
      ? `po-store-session-locations:${orderSaleChannel.id}`
      : null;
  const sessionProductSelectionStorageKey = orderSaleChannel
    ? selectedProductsStorageKey(orderSaleChannel.id)
    : null;
  const pickerProductSelectionStorageKey = orderSaleChannel
    ? productPickerStorageKey(orderSaleChannel.id)
    : null;

  const { data: savedLocations = [], isLoading: savedLocationsLoading } = useQuery({
    queryKey: ["sale-channel-locations", orderSaleChannel?.id],
    enabled: Boolean(orderSaleChannel?.id && orderSaleChannel.type === "distributor"),
    queryFn: async () => {
      const { data } = await api.get<SaleChannelLocation[]>(
        `/api/sale-channels/${orderSaleChannel?.id}/locations`,
      );
      return data;
    },
  });

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (!sessionLocationStorageKey) {
        setSessionLocations([]);
        setLoadedSessionLocationKey(null);
        return;
      }
      setSessionLocations(
        sessionLocationsFromStoredValue(readBrowserStorageItem(sessionLocationStorageKey)),
      );
      setLoadedSessionLocationKey(sessionLocationStorageKey);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionLocationStorageKey]);

  useEffect(() => {
    if (!sessionLocationStorageKey || loadedSessionLocationKey !== sessionLocationStorageKey) return;
    writeBrowserStorageItem(sessionLocationStorageKey, JSON.stringify(sessionLocations));
  }, [loadedSessionLocationKey, sessionLocationStorageKey, sessionLocations]);

  useEffect(() => {
    if (!sessionLocationStorageKey) return;

    function handleStorage(event: StorageEvent) {
      if (
        event.storageArea !== window.localStorage ||
        event.key !== sessionLocationStorageKey
      ) {
        return;
      }
      setSessionLocations(sessionLocationsFromStoredValue(readBrowserStorageEventItem(event)));
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [sessionLocationStorageKey]);

  const locations = isStoreSaleChannel ? sessionLocations : savedLocations;
  const locationsPending =
    orderSaleChannel?.type === "distributor" ? savedLocationsLoading : false;

  const {
    data: products = [],
    isLoading: productsLoading,
    isPending: productsPending,
  } = useQuery({
    queryKey: ["sale-channel-products"],
    queryFn: async () => {
      const { data } = await api.get<SaleChannelProduct[]>("/api/sale-channel/products");
      return data;
    },
  });

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );
  const sessionSelectedProductIds = useMemo(
    () => uniqueProductIds(rows.map((row) => row.productId)),
    [rows],
  );

  useEffect(() => {
    let cancelled = false;

    if (!sessionProductSelectionStorageKey) {
      if (saleChannelsLoading) return;
      queueMicrotask(() => {
        if (!cancelled) setLoadedSessionProductSelectionKey(null);
      });
      return () => {
        cancelled = true;
      };
    }
    if (
      productsPending ||
      loadedSessionProductSelectionKey === sessionProductSelectionStorageKey
    ) {
      return;
    }

    queueMicrotask(() => {
      if (cancelled) return;
      const productIds = readStoredProductIds(sessionProductSelectionStorageKey);
      setRows((current) => rowsFromStoredProductIds(productIds, productById, current));
      setLoadedSessionProductSelectionKey(sessionProductSelectionStorageKey);
    });

    return () => {
      cancelled = true;
    };
  }, [
    loadedSessionProductSelectionKey,
    productById,
    productsPending,
    saleChannelsLoading,
    sessionProductSelectionStorageKey,
  ]);

  useEffect(() => {
    if (
      !sessionProductSelectionStorageKey ||
      loadedSessionProductSelectionKey !== sessionProductSelectionStorageKey
    ) {
      return;
    }
    writeBrowserStorageItem(
      sessionProductSelectionStorageKey,
      JSON.stringify(sessionSelectedProductIds),
    );
  }, [
    loadedSessionProductSelectionKey,
    sessionProductSelectionStorageKey,
    sessionSelectedProductIds,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (
      productsPending ||
      !sessionProductSelectionStorageKey ||
      loadedSessionProductSelectionKey !== sessionProductSelectionStorageKey
    ) {
      return;
    }

    queueMicrotask(() => {
      if (cancelled) return;
      setRows((current) => {
        const availableRows = current.filter(
          (row) => !row.productId || productById.has(row.productId),
        );
        const next = ensureTrailingBlankRow(availableRows);
        if (
          next.length === current.length &&
          next.every((row, index) => row === current[index])
        ) {
          return current;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    loadedSessionProductSelectionKey,
    productById,
    productsPending,
    sessionProductSelectionStorageKey,
  ]);

  useEffect(() => {
    if (
      productsPending ||
      !sessionProductSelectionStorageKey ||
      loadedSessionProductSelectionKey !== sessionProductSelectionStorageKey
    ) {
      return;
    }

    function handleStorage(event: StorageEvent) {
      if (
        event.storageArea !== window.localStorage ||
        event.key !== sessionProductSelectionStorageKey
      ) {
        return;
      }
      const productIds = productIdsFromStoredValue(readBrowserStorageEventItem(event));
      setRows((current) => rowsFromStoredProductIds(productIds, productById, current));
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [
    loadedSessionProductSelectionKey,
    productById,
    productsPending,
    sessionProductSelectionStorageKey,
  ]);

  const activeLocationIds = useMemo(() => {
    return locations
      .filter((location) =>
        rows.some((row) => row.productId && quantityValue(row, location.id) > 0),
      )
      .map((location) => location.id);
  }, [locations, rows]);

  const activeLocationIdSet = useMemo(() => new Set(activeLocationIds), [activeLocationIds]);
  const hasActiveQuantities = activeLocationIds.length > 0;
  const isUploading = Object.entries(uploadingByLocationId).some(
    ([locationId, uploading]) => activeLocationIdSet.has(locationId) && uploading,
  );

  const selectedProductIds = useMemo(
    () => new Set(rows.map((row) => row.productId).filter(Boolean)),
    [rows],
  );

  const rowsWithActiveQuantity = useMemo(
    () => rows.filter((row) => row.productId && rowQuantityTotal(row) > 0),
    [rows],
  );
  const invalidPriceProducts = rowsWithActiveQuantity
    .map((row) => productById.get(row.productId))
    .filter((product): product is SaleChannelProduct => Boolean(product))
    .filter((product) => {
      const cents = productPriceCents(product);
      return cents == null || cents <= 0;
    });

  const moqViolations = useMemo(() => {
    const violations: Array<{
      product: SaleChannelProduct;
      location: SaleChannelLocation;
      quantity: number;
      moq: number;
    }> = [];

    for (const row of rowsWithActiveQuantity) {
      const product = productById.get(row.productId);
      const moq = productMoq(product);
      if (!product || moq == null) continue;

      for (const location of locations) {
        const quantity = quantityValue(row, location.id);
        if (!isQuantityMoqValid(quantity, moq)) {
          violations.push({ product, location, quantity, moq });
        }
      }
    }

    return violations;
  }, [locations, productById, rowsWithActiveQuantity]);

  const cartonViolations = useMemo(() => {
    const violations: Array<{
      product: SaleChannelProduct;
      location: SaleChannelLocation;
      quantity: number;
      itemsPerCarton: number;
    }> = [];

    for (const row of rowsWithActiveQuantity) {
      const product = productById.get(row.productId);
      const itemsPerCarton = productItemsPerCarton(product);
      if (!product || itemsPerCarton == null) continue;

      for (const location of locations) {
        const quantity = quantityValue(row, location.id);
        if (!isQuantityCartonValid(quantity, itemsPerCarton)) {
          violations.push({ product, location, quantity, itemsPerCarton });
        }
      }
    }

    return violations;
  }, [locations, productById, rowsWithActiveQuantity]);

  const locationTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const location of locations) totals.set(location.id, 0);
    for (const row of rows) {
      const product = productById.get(row.productId);
      const priceCents = productPriceCents(product);
      if (priceCents == null || priceCents <= 0) continue;
      for (const location of locations) {
        const quantity = quantityValue(row, location.id);
        if (quantity > 0) {
          totals.set(location.id, (totals.get(location.id) ?? 0) + quantity * priceCents);
        }
      }
    }
    return totals;
  }, [locations, productById, rows]);

  const grandTotalCents = Array.from(locationTotals.values()).reduce((sum, total) => sum + total, 0);

  const setLocationPurchaseOrderName = useCallback((locationId: string, name: string) => {
    setPurchaseOrderNamesByLocationId((current) => {
      if (!name) {
        const next = { ...current };
        delete next[locationId];
        return next;
      }
      return {
        ...current,
        [locationId]: name,
      };
    });
  }, []);

  const setLocationDocument = useCallback((locationId: string, documentKey: string | null) => {
    setDocumentsByLocationId((current) => ({
      ...current,
      [locationId]: documentKey,
    }));
  }, []);

  const setLocationUploading = useCallback((locationId: string, uploading: boolean) => {
    setUploadingByLocationId((current) => ({
      ...current,
      [locationId]: uploading,
    }));
  }, []);

  function updateRowQuantity(rowId: string, locationId: string, quantity: number) {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? setQuantity(row, locationId, quantity) : row)),
    );
  }

  function removeRow(rowId: string) {
    setProductDetailRowId((current) => (current === rowId ? null : current));
    setRows((current) => {
      const next = current.filter((row) => row.id !== rowId);
      return ensureTrailingBlankRow(next);
    });
  }

  function openProductPicker(rowId: string) {
    setProductPickerRowId(rowId);
    setProductPickerOpen(true);
  }

  function handleProductPickerOpenChange(open: boolean) {
    setProductPickerOpen(open);
    if (!open) setProductPickerRowId(null);
  }

  function addProductsFromPicker(productIds: string[]) {
    const validProductIds = productIds.filter((productId) => productById.has(productId));
    if (validProductIds.length === 0) return;

    setRows((current) => {
      const currentProductIds = new Set(
        current.map((row) => row.productId).filter(Boolean),
      );
      let pendingProductIds = validProductIds.filter(
        (productId) => !currentProductIds.has(productId),
      );
      if (pendingProductIds.length === 0) return current;

      let nextRows = current;
      const targetIndex = productPickerRowId
        ? current.findIndex((row) => row.id === productPickerRowId)
        : -1;

      if (targetIndex >= 0 && !current[targetIndex].productId && pendingProductIds.length > 0) {
        const [targetProductId, ...remainingProductIds] = pendingProductIds;
        nextRows = current.map((row, index) =>
          index === targetIndex ? { ...row, productId: targetProductId } : row,
        );
        pendingProductIds = remainingProductIds;
      }

      for (const productId of pendingProductIds) {
        nextRows = [
          ...nextRows,
          {
            ...newRow(nextOrderRowId(nextRows)),
            productId,
          },
        ];
      }

      return ensureTrailingBlankRow(nextRows);
    });
  }

  async function saveSessionLocation(payload: {
    id?: string;
    values: SaleChannelLocationFormValues;
  }): Promise<string> {
    if (!orderSaleChannel) throw new Error("No sale channel is assigned to your account");
    const id = payload.id ?? crypto.randomUUID();
    setSessionLocations((current) => {
      const previous = current.find((location) => location.id === id) ?? null;
      const nextLocation = sessionLocationFromValues({
        id,
        saleChannelId: orderSaleChannel.id,
        values: payload.values,
        previous,
      });
      return previous
        ? current.map((location) => (location.id === id ? nextLocation : location))
        : [...current, nextLocation];
    });
    return id;
  }

  function deleteSessionLocation(locationId: string) {
    setSessionLocations((current) => current.filter((location) => location.id !== locationId));
    setRows((current) =>
      current.map((row) => {
        const quantities = { ...row.quantities };
        delete quantities[locationId];
        return { ...row, quantities };
      }),
    );
    setDocumentsByLocationId((current) => {
      const documents = { ...current };
      delete documents[locationId];
      return documents;
    });
    setPurchaseOrderNamesByLocationId((current) => {
      const names = { ...current };
      delete names[locationId];
      return names;
    });
  }

  function getBackOrderReviewLines(draftLines: BackOrderDraftLine[]) {
    const remainingStockByProductId = new Map<string, number>();

    return draftLines.flatMap((line): BackOrderReviewLine[] => {
      const product = productById.get(line.productId);
      const location = locationById.get(line.locationId);
      if (!product || !location || product.stockCount == null) return [];

      const remainingStock =
        remainingStockByProductId.get(product.id) ?? Math.max(0, product.stockCount);
      const requestedQuantity = Math.max(0, line.quantity);
      const availableQuantity = Math.min(requestedQuantity, remainingStock);
      remainingStockByProductId.set(product.id, remainingStock - availableQuantity);

      return [
        {
          ...line,
          key: backOrderLineKey(line.rowId, line.locationId),
          product,
          location,
          quantity: requestedQuantity,
          availableQuantity,
          unavailableQuantity: requestedQuantity - availableQuantity,
          stockCount: product.stockCount,
          isShort: requestedQuantity > availableQuantity,
        },
      ];
    });
  }

  function getBackOrderReview(): BackOrderReview | null {
    const lines = rowsWithActiveQuantity.flatMap((row): BackOrderDraftLine[] => {
      const product = productById.get(row.productId);
      if (!product || product.stockCount == null) return [];

      return locations.flatMap((location): BackOrderDraftLine[] => {
        const quantity = quantityValue(row, location.id);
        if (quantity <= 0) return [];

        return [
          {
            rowId: row.id,
            productId: row.productId,
            locationId: location.id,
            quantity,
            backOrder: true,
          },
        ];
      });
    });

    const visibleLineKeys = getBackOrderReviewLines(lines)
      .filter((line) => line.isShort)
      .map((line) => line.key);

    if (visibleLineKeys.length === 0) return null;
    return {
      lines,
      visibleLineKeys,
    };
  }

  function updateBackOrderDraftLine(
    rowId: string,
    locationId: string,
    values: Partial<Pick<BackOrderDraftLine, "quantity" | "backOrder">>,
  ) {
    setBackOrderReview((current) => {
      if (!current) return current;
      return {
        ...current,
        lines: current.lines.map((line) =>
          line.rowId === rowId && line.locationId === locationId
            ? {
                ...line,
                ...values,
              }
            : line,
        ),
      };
    });
  }

  function applyBackOrderDraftToRows(lines: BackOrderDraftLine[]) {
    const quantityByLineKey = new Map(
      lines.map((line) => [backOrderLineKey(line.rowId, line.locationId), line.quantity]),
    );

    setRows((current) =>
      current.map((row) => {
        let nextRow = row;
        for (const location of locations) {
          const quantity = quantityByLineKey.get(backOrderLineKey(row.id, location.id));
          if (quantity == null) continue;
          nextRow = setQuantity(nextRow, location.id, quantity);
        }
        return nextRow;
      }),
    );
  }

  function distributorOrderLines(mode: BackOrderSubmitMode) {
    const remainingStockByProductId = new Map<string, number>();
    const backOrderDraftByLineKey = new Map(
      mode.lines.map((line) => [backOrderLineKey(line.rowId, line.locationId), line]),
    );

    return rowsWithActiveQuantity
      .map((row) => {
        const product = productById.get(row.productId);
        const quantities = locations.map((location) => {
          const backOrderDraft = backOrderDraftByLineKey.get(
            backOrderLineKey(row.id, location.id),
          );
          const requestedQuantity = Math.max(
            0,
            backOrderDraft?.quantity ?? quantityValue(row, location.id),
          );
          let quantity = requestedQuantity;
          let backOrderQuantity = 0;

          if (product?.stockCount != null) {
            if (product.stockCount <= 0) {
              quantity = 0;
              backOrderQuantity = backOrderDraft?.backOrder ? requestedQuantity : 0;
            } else {
              const remaining =
                remainingStockByProductId.get(product.id) ?? product.stockCount;
              quantity = Math.min(requestedQuantity, Math.max(0, remaining));
              remainingStockByProductId.set(product.id, remaining - quantity);
              const overflowQuantity = requestedQuantity - quantity;
              backOrderQuantity = backOrderDraft?.backOrder ? overflowQuantity : 0;
            }
          }

          return isStoreSaleChannel
            ? {
                sessionLocation: location,
                quantity,
                backOrderQuantity,
              }
            : {
                saleChannelLocationId: location.id,
                quantity,
                backOrderQuantity,
              };
        });

        return {
          productId: row.productId,
          quantities,
        };
      })
      .filter((line) =>
        line.quantities.some(
          (quantity) => quantity.quantity > 0 || quantity.backOrderQuantity > 0,
        ),
      );
  }

  function activeLocationIdsForOrderLines(
    lines: ReturnType<typeof distributorOrderLines>,
  ) {
    const activeIds = new Set<string>();
    for (const line of lines) {
      for (const quantity of line.quantities) {
        if (quantity.quantity <= 0 && quantity.backOrderQuantity <= 0) continue;
        if ("sessionLocation" in quantity && quantity.sessionLocation) {
          activeIds.add(quantity.sessionLocation.id);
        } else {
          activeIds.add(quantity.saleChannelLocationId);
        }
      }
    }
    return Array.from(activeIds);
  }

  function requestSubmitOrder() {
    const review = getBackOrderReview();
    if (review) {
      setBackOrderReview(review);
      return;
    }
    submitOrder.mutate({ lines: [] });
  }

  function submitBackOrderResolution(review: BackOrderReview) {
    applyBackOrderDraftToRows(review.lines);
    setBackOrderReview(null);
    submitOrder.mutate({ lines: review.lines });
  }

  const submitOrder = useMutation<OrderSubmitResponse, unknown, BackOrderSubmitMode>({
    mutationFn: async (mode) => {
      const lines = distributorOrderLines(mode);
      const submittedActiveLocationIds = activeLocationIdsForOrderLines(lines);
      const purchaseOrderNames = submittedActiveLocationIds.flatMap((locationId) => {
        const name = purchaseOrderNamesByLocationId[locationId]?.trim();
        if (!name) return [];
        return [
          isStoreSaleChannel
            ? {
                destinationKey: sessionDestinationKey(locationId),
                name,
              }
            : {
                saleChannelLocationId: locationId,
                name,
              },
        ];
      });
      const { data: draftResponse } = await api.post<
        DraftCreateResponse | DirectOrderCreateResponse
      >(
        "/api/distributor-order-drafts",
        {
          lines,
          purchaseOrderNames,
          documents: submittedActiveLocationIds.map((locationId) =>
            isStoreSaleChannel
              ? {
                  destinationKey: sessionDestinationKey(locationId),
                  documentKey: documentsByLocationId[locationId] ?? null,
                }
              : {
                  saleChannelLocationId: locationId,
                  documentKey: documentsByLocationId[locationId] ?? null,
                },
          ),
        },
      );

      if (!isStoreSaleChannel) {
        if ("purchaseOrders" in draftResponse) {
          return {
            action: "placed",
            purchaseOrderIds: draftResponse.convertedPurchaseOrderIds,
          };
        }

        const { data: placedOrder } = await api.post<PlaceOrderResponse>(
          `/api/distributor-order-invoices/${draftResponse.invoice.id}/place-order`,
        );
        return {
          action: "placed",
          purchaseOrderIds: placedOrder.convertedPurchaseOrderIds,
        };
      }

      if (!("invoice" in draftResponse)) {
        throw new Error("Expected an invoice-backed checkout response");
      }

      const { data: checkout } = await api.post<CheckoutResponse>(
        `/api/distributor-order-invoices/${draftResponse.invoice.id}/checkout`,
      );
      return {
        action: "checkout",
        checkoutUrl: checkout.checkoutUrl,
      };
    },
    onSuccess: (result) => {
      if (result.action === "checkout") {
        window.location.assign(result.checkoutUrl);
        return;
      }
      const purchaseOrderIds = encodeURIComponent(result.purchaseOrderIds.join(","));
      window.location.assign(`/new-order/success?purchaseOrderIds=${purchaseOrderIds}`);
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error)),
  });

  const canSubmit =
    hasActiveQuantities &&
    invalidPriceProducts.length === 0 &&
    moqViolations.length === 0 &&
    cartonViolations.length === 0 &&
    !isUploading &&
    !submitOrder.isPending &&
    !saleChannelsLoading &&
    !locationsPending &&
    !productsLoading;

  const activeLocations = locations.filter((location) => activeLocationIdSet.has(location.id));
  const backOrderReviewLines = backOrderReview
    ? getBackOrderReviewLines(backOrderReview.lines)
    : [];
  const backOrderVisibleLineKeys = new Set(backOrderReview?.visibleLineKeys ?? []);
  const backOrderDisplayLines = backOrderReviewLines.filter(
    (line) => line.isShort || backOrderVisibleLineKeys.has(line.key),
  );
  const backOrderShortageUnits = backOrderReviewLines.reduce(
    (sum, line) => sum + line.unavailableQuantity,
    0,
  );

  const productDetailRow = productDetailRowId
    ? rows.find((row) => row.id === productDetailRowId)
    : null;
  const productDetailProduct = productDetailRow
    ? productById.get(productDetailRow.productId)
    : null;
  const productDetailQuantities = productDetailRow
    ? locations.map((location) => ({
        location,
        quantity: quantityValue(productDetailRow, location.id),
      }))
    : [];
  const productDetailPriceCents = productPriceCents(productDetailProduct ?? undefined);
  const productDetailRowTotal =
    productDetailRow && productDetailPriceCents && productDetailPriceCents > 0
      ? (rowQuantityTotal(productDetailRow) * productDetailPriceCents) / 100
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">New Order</h1>
          <p className="text-sm text-muted-foreground">
            {isStoreSaleChannel
              ? "Select products, enter quantities by location, then pay securely with Stripe."
              : "Select products, enter quantities by location, then place your order."}
          </p>
        </div>
        <Button
          type="button"
          onClick={requestSubmitOrder}
          disabled={!canSubmit}
          className="w-full sm:w-auto"
        >
          {submitOrder.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isStoreSaleChannel ? (
            <CreditCard className="size-4" />
          ) : (
            <ShoppingCart className="size-4" />
          )}
          {isStoreSaleChannel ? (
            <>
              Pay {grandTotalCents > 0 ? <PriceView value={grandTotalCents / 100} /> : null}
            </>
          ) : (
            "Place order"
          )}
        </Button>
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>Order Details</CardTitle>
          <CardDescription>
            {isStoreSaleChannel
              ? "One purchase order will be created for each location with quantity after payment."
              : "One purchase order will be created for each location with quantity."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isStoreSaleChannel ? (
            <div className="space-y-3 rounded-lg border border-border/80 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">Session locations</p>
                  <p className="text-sm text-muted-foreground">
                    These locations are saved in this browser and shared across tabs.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingSessionLocation(null);
                    setSessionLocationOpen(true);
                  }}
                >
                  <MapPinned className="size-4" />
                  Add location
                </Button>
              </div>
              {sessionLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add a location before entering order quantities.
                </p>
              ) : (
                <div className="divide-y divide-border/70 rounded-lg border border-border/80">
                  {sessionLocations.map((location) => (
                    <div
                      key={location.id}
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{location.name}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {[location.addressLine1, location.city, location.stateProvince, location.country]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setEditingSessionLocation(location);
                            setSessionLocationOpen(true);
                          }}
                          aria-label="Edit location"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteSessionLocation(location.id)}
                          aria-label="Delete location"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {!saleChannelsLoading && !orderSaleChannel ? (
            <p className="text-sm text-destructive">
              Your account is not linked to an order sale channel.
            </p>
          ) : null}
          {!locationsPending && orderSaleChannel && locations.length === 0 ? (
            <p className="text-sm text-destructive">
              Add at least one location before creating an order.
            </p>
          ) : null}
          {invalidPriceProducts.length > 0 ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
              These products need a valid price before ordering:{" "}
              {invalidPriceProducts.map((product) => `${product.sku} - ${product.name}`).join(", ")}
            </div>
          ) : null}
          {moqViolations.length > 0 ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
              Quantities must be at least each product&apos;s MOQ (or zero):{" "}
              {[
                ...new Map(
                  moqViolations.map(({ product, moq }) => [
                    product.id,
                    `${product.sku} - ${product.name} (MOQ ${moq})`,
                  ]),
                ).values(),
              ].join(", ")}
            </div>
          ) : null}
          {cartonViolations.length > 0 ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
              Quantities must be in full-carton increments (or zero):{" "}
              {[
                ...new Map(
                  cartonViolations.map(({ product, itemsPerCarton }) => [
                    product.id,
                    `${product.sku} - ${product.name} (${itemsPerCarton} items per carton)`,
                  ]),
                ).values(),
              ].join(", ")}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-border/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-64 sm:min-w-72">Product</TableHead>
                  <TableHead className="w-32 text-end">Unit price</TableHead>
                  <TableHead className="w-24 text-end">Available</TableHead>
                  {locations.map((location) => (
                    <TableHead key={location.id} className="min-w-32 text-end">
                      {location.name} Qty
                    </TableHead>
                  ))}
                  <TableHead className="w-32 text-end">Row total</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsLoading || locationsPending || saleChannelsLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={locations.length + 5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={locations.length + 5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No products are available.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const product = productById.get(row.productId);
                    const moq = productMoq(product);
                    const itemsPerCarton = productItemsPerCarton(product);
                    const priceCents = productPriceCents(product);
                    const rowTotalCents =
                      priceCents && priceCents > 0 ? rowQuantityTotal(row) * priceCents : 0;
                    const allProductsSelected = products.every((availableProduct) =>
                      selectedProductIds.has(availableProduct.id),
                    );

                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          {row.productId ? (
                            <div className="flex min-w-64 items-center gap-3 sm:min-w-72">
                              {product ? <OrderProductImage product={product} /> : null}
                              <div className="min-w-0">
                                <div className="font-medium leading-tight">
                                  {product?.name ?? "Unknown product"}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span className="font-mono text-foreground">
                                    {product?.sku ?? row.productId}
                                  </span>
                                  {product?.collection?.name ? (
                                    <span>{product.collection.name}</span>
                                  ) : null}
                                  {product?.category?.name ? <span>{product.category.name}</span> : null}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={allProductsSelected}
                              onClick={() => openProductPicker(row.id)}
                              className="min-w-64 justify-start sm:min-w-72"
                            >
                              <Search className="size-4" />
                              {allProductsSelected ? "All products selected" : "Search products"}
                            </Button>
                          )}
                          {product && (priceCents == null || priceCents <= 0) ? (
                            <p className="mt-1 text-xs text-destructive">Missing price</p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-end">
                          <PriceView value={product?.wholesalePrice} />
                        </TableCell>
                        <TableCell className="text-end">
                          <AvailableStockCell product={product} />
                        </TableCell>
                        {locations.map((location) => {
                          const quantity = quantityValue(row, location.id);
                          const moqInvalid =
                            Boolean(row.productId) &&
                            moq != null &&
                            !isQuantityMoqValid(quantity, moq);
                          const cartonInvalid =
                            Boolean(row.productId) &&
                            itemsPerCarton != null &&
                            !isQuantityCartonValid(quantity, itemsPerCarton);
                          const quantityInvalid = moqInvalid || cartonInvalid;

                          return (
                            <TableCell key={location.id}>
                              <div className="ml-auto w-24 space-y-1 sm:w-28">
                                <Input
                                  type="number"
                                  min={0}
                                  step={itemsPerCarton ?? 1}
                                  disabled={!row.productId}
                                  aria-invalid={quantityInvalid}
                                  className={cn(
                                    "w-full text-end tabular-nums",
                                    quantityInvalid && "border-destructive",
                                  )}
                                  value={
                                    row.productId && quantity > 0 ? quantity : ""
                                  }
                                  placeholder="0"
                                  onChange={(event) =>
                                    updateRowQuantity(
                                      row.id,
                                      location.id,
                                      Math.max(0, Number(event.target.value) || 0),
                                    )
                                  }
                                  onBlur={() => {
                                    if (!row.productId || itemsPerCarton == null) return;
                                    const snapped = snapQuantityToCarton(quantity, itemsPerCarton);
                                    if (snapped !== quantity) {
                                      updateRowQuantity(row.id, location.id, snapped);
                                    }
                                  }}
                                />
                                {itemsPerCarton != null && row.productId ? (
                                  <p className="text-end text-xs text-muted-foreground">
                                    {itemsPerCarton} items per carton
                                  </p>
                                ) : null}
                                {moqInvalid ? (
                                  <p className="text-end text-xs text-destructive">
                                    MOQ {moq}
                                  </p>
                                ) : null}
                                {cartonInvalid ? (
                                  <p className="text-end text-xs text-destructive">
                                    Full cartons only
                                  </p>
                                ) : null}
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-end">
                          <PriceView value={row.productId ? rowTotalCents / 100 : null} />
                        </TableCell>
                        <TableCell>
                          {row.productId ? (
                            <div className="flex justify-end gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setProductDetailRowId(row.id)}
                                aria-label="View product details"
                              >
                                <Eye className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => removeRow(row.id)}
                                aria-label="Remove product"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
                {locations.length > 0 ? (
                  <TableRow className="bg-muted/30 font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell />
                    <TableCell />
                    {locations.map((location) => (
                      <TableCell
                        key={location.id}
                        className={cn(
                          "text-end",
                          activeLocationIdSet.has(location.id) ? "" : "text-muted-foreground",
                        )}
                      >
                        <PriceView value={(locationTotals.get(location.id) ?? 0) / 100} />
                      </TableCell>
                    ))}
                    <TableCell className="text-end">
                      <PriceView value={grandTotalCents / 100} />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {activeLocations.length > 0 ? (
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle>Location PO Details</CardTitle>
            <CardDescription>
              Set optional PO names and documents for each location that has quantity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {activeLocations.map((location) => (
                <LocationPurchaseOrderDetails
                  key={location.id}
                  location={location}
                  purchaseOrderName={purchaseOrderNamesByLocationId[location.id] ?? ""}
                  onPurchaseOrderNameChange={setLocationPurchaseOrderName}
                  onDocumentChange={setLocationDocument}
                  onUploadingChange={setLocationUploading}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={backOrderReview != null}
        onOpenChange={(open) => {
          if (!open) setBackOrderReview(null);
        }}
      >
        <DialogContent size="7xl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Back Order needed</DialogTitle>
            <DialogDescription>
              Review the lines that are not fully available before placing the order.
            </DialogDescription>
          </DialogHeader>
          {backOrderReview ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border/80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-64">Line</TableHead>
                      <TableHead className="min-w-40">Location</TableHead>
                      <TableHead className="w-32 text-end">Quantity</TableHead>
                      <TableHead className="w-32 text-end">Available</TableHead>
                      <TableHead className="w-32 text-end">Short</TableHead>
                      <TableHead className="w-48">Action</TableHead>
                      <TableHead className="w-36">Back Order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backOrderDisplayLines.length > 0 ? (
                      backOrderDisplayLines.map((line) => {
                        const checkboxId = `back-order-${line.key}`;

                        return (
                          <TableRow key={line.key}>
                            <TableCell>
                              <div className="flex min-w-64 items-center gap-3">
                                <OrderProductImage product={line.product} />
                                <div className="min-w-0">
                                  <div className="font-medium leading-tight">
                                    {line.product.name}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-mono text-foreground">
                                      {line.product.sku}
                                    </span>
                                    <span>Stock {line.stockCount}</span>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="min-w-0">
                                <p className="font-medium">{line.location.name}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                className="ml-auto w-24 text-end tabular-nums"
                                value={line.quantity > 0 ? line.quantity : ""}
                                placeholder="0"
                                onChange={(event) =>
                                  updateBackOrderDraftLine(line.rowId, line.locationId, {
                                    quantity: Math.max(0, Number(event.target.value) || 0),
                                  })
                                }
                              />
                            </TableCell>
                            <TableCell className="text-end tabular-nums">
                              {line.availableQuantity}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-end tabular-nums",
                                line.isShort ? "text-destructive" : "text-muted-foreground",
                              )}
                            >
                              {line.unavailableQuantity}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={!line.isShort}
                                onClick={() =>
                                  updateBackOrderDraftLine(line.rowId, line.locationId, {
                                    quantity: line.availableQuantity,
                                    backOrder: false,
                                  })
                                }
                              >
                                Reduce to available stock
                              </Button>
                            </TableCell>
                            <TableCell>
                              {line.quantity > line.availableQuantity ? (
                                <Checkbox
                                  id={checkboxId}
                                  checked={line.backOrder}
                                  label="Back Order"
                                  onCheckedChange={(value) =>
                                    updateBackOrderDraftLine(line.rowId, line.locationId, {
                                      backOrder: value === true,
                                    })
                                  }
                                />
                              ) : (
                                <span className="text-muted-foreground">Resolved</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="h-24 text-center text-muted-foreground"
                        >
                          All lines are within available stock.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {backOrderShortageUnits > 0 ? (
                <p className="text-muted-foreground">
                  {backOrderShortageUnits} unit
                  {backOrderShortageUnits === 1 ? "" : "s"} are currently short.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Resolve will place the order with the quantities shown above.
                </p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitOrder.isPending}
              onClick={() => setBackOrderReview(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitOrder.isPending || !backOrderReview}
              onClick={() => {
                if (!backOrderReview) return;
                submitBackOrderResolution(backOrderReview);
              }}
            >
              {submitOrder.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {productPickerOpen ? (
        <ProductPickerDialog
          open={productPickerOpen}
          onOpenChange={handleProductPickerOpenChange}
          products={products}
          selectedProductIds={selectedProductIds}
          storageKey={pickerProductSelectionStorageKey}
          onAddProducts={addProductsFromPicker}
        />
      ) : null}
      <ProductDetailDialog
        open={productDetailRowId != null}
        onOpenChange={(open) => {
          if (!open) setProductDetailRowId(null);
        }}
        product={productDetailProduct ?? null}
        quantities={productDetailQuantities}
        rowTotal={productDetailRowTotal}
      />
      {isStoreSaleChannel ? (
        <SaleChannelLocationUpsertDialog
          open={sessionLocationOpen}
          onOpenChange={(next) => {
            setSessionLocationOpen(next);
            if (!next) setEditingSessionLocation(null);
          }}
          editing={editingSessionLocation}
          onSave={async (payload) => {
            const id = await saveSessionLocation(payload);
            setSessionLocationOpen(false);
            setEditingSessionLocation(null);
            return id;
          }}
        />
      ) : null}
    </div>
  );
}
