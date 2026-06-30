"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type {
  CjDropshippingIntegrationSettings,
  CjDropshippingInventoryCountsResponse,
  CjDropshippingInventoryTransactionsResponse,
  CjDropshippingSyncResult,
  CjDropshippingWarehouseOption,
  ProductStockSnapshotBackup,
  ShopifyInventoryCountsResponse,
  ShopifyInventoryLocationOption,
  ShopifyInventoryMovementsResponse,
  ShopifyIntegrationSettings,
  ShopifySyncResult,
  StripeIntegrationSettings,
} from "@/lib/types/api";
import {
  postSyncEventStream,
  type SyncStreamMessage,
} from "@/lib/sync-event-stream";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DocumentDownloadLink } from "@/components/ui/document-download-link";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const shopifyIntegrationKey = ["shopify-integration"] as const;
const cjDropshippingIntegrationKey = ["cjdropshipping-integration"] as const;
const stripeIntegrationKey = ["stripe-integration"] as const;
const productStockBackupsKey = ["product-stock-snapshot-backups"] as const;
const shopifyInventoryCountsKey = ["shopify-inventory-counts"] as const;
const shopifyInventoryMovementsKey = ["shopify-inventory-movements"] as const;
const cjDropshippingInventoryCountsKey = ["cjdropshipping-inventory-counts"] as const;
const cjDropshippingInventoryTransactionsKey = [
  "cjdropshipping-inventory-transactions",
] as const;
const allLocationsValue = "__all_locations__";
const inventoryPageSize = 8;

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string | null) {
  if (!status) return "Not synced";
  const labels: Record<string, string> = {
    scheduled: "Scheduled sync",
    manual: "Manual sync",
    webhook: "Webhook sync",
    error: "Error",
  };
  return labels[status] ?? status;
}

function formatDateOnly(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(year, month - 1, day));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatElapsedMs(ms: number) {
  const totalSeconds = Math.max(Math.floor(ms / 1000), 1);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function syncProgressMessage<T>(provider: string, event: SyncStreamMessage<T>) {
  if (event.event === "started") return `${provider} sync started`;
  if (event.event === "heartbeat") {
    return `${provider} sync still running (${formatElapsedMs(event.elapsedMs)})`;
  }
  return null;
}

function buildInventoryQuery({
  page,
  q,
  locationId,
}: {
  page: number;
  q: string;
  locationId: string;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(inventoryPageSize));
  const search = q.trim();
  if (search) params.set("q", search);
  if (locationId !== allLocationsValue) params.set("locationId", locationId);
  return params.toString();
}

function buildCjInventoryQuery({
  page,
  q,
  warehouseId,
}: {
  page: number;
  q: string;
  warehouseId: string;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(inventoryPageSize));
  const search = q.trim();
  if (search) params.set("q", search);
  if (warehouseId !== allLocationsValue) params.set("warehouseId", warehouseId);
  return params.toString();
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function triggerLabel(value: string) {
  return statusLabel(value).replace(" sync", "");
}

function locationLabel(location: ShopifyInventoryLocationOption) {
  return location.isActive ? location.name : `${location.name} (inactive)`;
}

function cjWarehouseLabel(warehouse: CjDropshippingWarehouseOption) {
  return warehouse.label || warehouse.cjAreaEn || warehouse.countryNameEn || warehouse.id;
}

function movementTypeLabel(value: string) {
  const labels: Record<string, string> = {
    initial: "Initial",
    increase: "Increase",
    decrease: "Decrease",
  };
  return labels[value] ?? value;
}

function InventoryPagination({
  page,
  total,
  onPageChange,
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(Math.ceil(total / inventoryPageSize), 1);
  const start = total === 0 ? 0 : (page - 1) * inventoryPageSize + 1;
  const end = Math.min(page * inventoryPageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {start}-{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-16 text-center text-xs text-muted-foreground">
          {page} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(page + 1, pageCount))}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ShopifyInventoryMirrorCard() {
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState(allLocationsValue);
  const [countsPage, setCountsPage] = useState(1);
  const [movementsPage, setMovementsPage] = useState(1);

  const countsQuery = buildInventoryQuery({ page: countsPage, q: search, locationId });
  const movementsQuery = buildInventoryQuery({ page: movementsPage, q: search, locationId });

  const counts = useQuery({
    queryKey: [...shopifyInventoryCountsKey, countsQuery],
    queryFn: async () => {
      const { data } = await api.get<ShopifyInventoryCountsResponse>(
        `/api/integrations/shopify/inventory-counts?${countsQuery}`,
      );
      return data;
    },
  });
  const movements = useQuery({
    queryKey: [...shopifyInventoryMovementsKey, movementsQuery],
    queryFn: async () => {
      const { data } = await api.get<ShopifyInventoryMovementsResponse>(
        `/api/integrations/shopify/inventory-movements?${movementsQuery}`,
      );
      return data;
    },
  });

  const locations = counts.data?.locations ?? movements.data?.locations ?? [];
  const countRows = counts.data?.rows ?? [];
  const movementRows = movements.data?.rows ?? [];

  function updateSearch(value: string) {
    setSearch(value);
    setCountsPage(1);
    setMovementsPage(1);
  }

  function updateLocation(value: unknown) {
    setLocationId(typeof value === "string" ? value : allLocationsValue);
    setCountsPage(1);
    setMovementsPage(1);
  }

  return (
    <div className="rounded-lg border bg-background p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Shopify inventory mirror</h2>
          <p className="text-sm text-muted-foreground">
            Read-only per-location counts and observed Shopify deltas.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[28rem] sm:flex-row">
          <Input
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search product, SKU, or location"
            className="sm:flex-1"
          />
          <Select value={locationId} onValueChange={updateLocation}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allLocationsValue}>All locations</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {locationLabel(location)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-md border">
          <div className="border-b bg-muted/40 px-3 py-2">
            <h3 className="text-sm font-medium">Current counts</h3>
          </div>
          {counts.isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Loading counts...</p>
          ) : counts.isError ? (
            <p className="m-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {apiErrorMessage(counts.error)}
            </p>
          ) : countRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No mirrored counts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-left font-medium">Location</th>
                    <th className="px-3 py-2 text-right font-medium">On hand</th>
                    <th className="px-3 py-2 text-left font-medium">Last sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {countRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{row.productName}</p>
                        <p className="text-xs text-muted-foreground">{row.sku}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p>{row.shopifyLocationName}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.inventoryLevelActive === false ? "Inactive level" : "Active level"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.onHand}</td>
                      <td className="px-3 py-2">
                        <p>{formatDate(row.lastSyncedAt)}</p>
                        <p className="text-xs text-muted-foreground">
                          {triggerLabel(row.lastSyncTrigger)}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <InventoryPagination
            page={countsPage}
            total={counts.data?.total ?? 0}
            onPageChange={setCountsPage}
          />
        </div>

        <div className="overflow-hidden rounded-md border">
          <div className="border-b bg-muted/40 px-3 py-2">
            <h3 className="text-sm font-medium">Movements</h3>
          </div>
          {movements.isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Loading movements...</p>
          ) : movements.isError ? (
            <p className="m-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {apiErrorMessage(movements.error)}
            </p>
          ) : movementRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No movements yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Observed</th>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-left font-medium">Location</th>
                    <th className="px-3 py-2 text-right font-medium">Before</th>
                    <th className="px-3 py-2 text-right font-medium">After</th>
                    <th className="px-3 py-2 text-right font-medium">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movementRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <p>{formatDate(row.observedAt)}</p>
                        <p className="text-xs text-muted-foreground">{triggerLabel(row.trigger)}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{row.productName}</p>
                        <p className="text-xs text-muted-foreground">{row.sku}</p>
                      </td>
                      <td className="px-3 py-2">{row.shopifyLocationName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.previousOnHand ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.newOnHand}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatSignedNumber(row.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <InventoryPagination
            page={movementsPage}
            total={movements.data?.total ?? 0}
            onPageChange={setMovementsPage}
          />
        </div>
      </div>
    </div>
  );
}

function CjDropshippingInventoryMirrorCard() {
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState(allLocationsValue);
  const [countsPage, setCountsPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);

  const countsQuery = buildCjInventoryQuery({
    page: countsPage,
    q: search,
    warehouseId,
  });
  const transactionsQuery = buildCjInventoryQuery({
    page: transactionsPage,
    q: search,
    warehouseId,
  });

  const counts = useQuery({
    queryKey: [...cjDropshippingInventoryCountsKey, countsQuery],
    queryFn: async () => {
      const { data } = await api.get<CjDropshippingInventoryCountsResponse>(
        `/api/integrations/cjdropshipping/inventory-counts?${countsQuery}`,
      );
      return data;
    },
  });
  const transactions = useQuery({
    queryKey: [...cjDropshippingInventoryTransactionsKey, transactionsQuery],
    queryFn: async () => {
      const { data } = await api.get<CjDropshippingInventoryTransactionsResponse>(
        `/api/integrations/cjdropshipping/inventory-transactions?${transactionsQuery}`,
      );
      return data;
    },
  });

  const warehouses = counts.data?.warehouses ?? transactions.data?.warehouses ?? [];
  const countRows = counts.data?.rows ?? [];
  const transactionRows = transactions.data?.rows ?? [];

  function updateSearch(value: string) {
    setSearch(value);
    setCountsPage(1);
    setTransactionsPage(1);
  }

  function updateWarehouse(value: unknown) {
    setWarehouseId(typeof value === "string" ? value : allLocationsValue);
    setCountsPage(1);
    setTransactionsPage(1);
  }

  return (
    <div className="rounded-lg border bg-background p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">CJdropshipping inventory mirror</h2>
          <p className="text-sm text-muted-foreground">
            Current CJ warehouse counts and observed inventory transactions.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[28rem] sm:flex-row">
          <Input
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search product, SKU, or warehouse"
            className="sm:flex-1"
          />
          <Select value={warehouseId} onValueChange={updateWarehouse}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allLocationsValue}>All warehouses</SelectItem>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse.id} value={warehouse.id}>
                  {cjWarehouseLabel(warehouse)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-md border">
          <div className="border-b bg-muted/40 px-3 py-2">
            <h3 className="text-sm font-medium">Current counts</h3>
          </div>
          {counts.isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Loading CJ counts...</p>
          ) : counts.isError ? (
            <p className="m-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {apiErrorMessage(counts.error)}
            </p>
          ) : countRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No CJ counts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-left font-medium">Warehouse</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium">CJ</th>
                    <th className="px-3 py-2 text-right font-medium">Factory</th>
                    <th className="px-3 py-2 text-left font-medium">Last sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {countRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium">
                          {row.productName ?? row.cjProductName ?? "Unmatched CJ product"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          SKU {row.sku}
                          {!row.productId ? " / No local product" : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <p>{row.cjAreaEn ?? row.countryNameEn ?? row.cjAreaId}</p>
                        <p className="text-xs text-muted-foreground">
                          {[row.countryCode, row.countryNameEn]
                            .filter(Boolean)
                            .join(" / ") || "CJ warehouse"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.totalInventoryNum}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.cjInventoryNum}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.factoryInventoryNum}
                      </td>
                      <td className="px-3 py-2">
                        <p>{formatDate(row.lastSyncedAt)}</p>
                        <p className="text-xs text-muted-foreground">
                          {triggerLabel(row.lastSyncTrigger)}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <InventoryPagination
            page={countsPage}
            total={counts.data?.total ?? 0}
            onPageChange={setCountsPage}
          />
        </div>

        <div className="overflow-hidden rounded-md border">
          <div className="border-b bg-muted/40 px-3 py-2">
            <h3 className="text-sm font-medium">Transactions</h3>
          </div>
          {transactions.isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Loading CJ transactions...</p>
          ) : transactions.isError ? (
            <p className="m-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {apiErrorMessage(transactions.error)}
            </p>
          ) : transactionRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No CJ transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Observed</th>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-left font-medium">Warehouse</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-right font-medium">Before</th>
                    <th className="px-3 py-2 text-right font-medium">After</th>
                    <th className="px-3 py-2 text-right font-medium">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactionRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <p>{formatDate(row.observedAt)}</p>
                        <p className="text-xs text-muted-foreground">{triggerLabel(row.trigger)}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">
                          {row.productName ?? row.cjProductName ?? "Unmatched CJ product"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          SKU {row.sku}
                          {!row.productId ? " / No local product" : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        {row.cjAreaEn ?? row.countryNameEn ?? row.cjAreaId}
                      </td>
                      <td className="px-3 py-2">{movementTypeLabel(row.movementType)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.previousTotalInventoryNum ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.newTotalInventoryNum}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatSignedNumber(row.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <InventoryPagination
            page={transactionsPage}
            total={transactions.data?.total ?? 0}
            onPageChange={setTransactionsPage}
          />
        </div>
      </div>
    </div>
  );
}

function ProductStockBackupsCard() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: productStockBackupsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<ProductStockSnapshotBackup[]>(
        "/api/integrations/product-stock-backups",
      );
      return rows;
    },
  });
  const backups = data ?? [];

  return (
    <div className="rounded-lg border bg-background p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Daily stock backups</h2>
        <p className="text-sm text-muted-foreground">
          Local product stock plus CJ-only inventory CSV snapshots.
        </p>
      </div>

      {isPending ? (
        <p className="py-4 text-sm text-muted-foreground">Loading backups...</p>
      ) : isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {apiErrorMessage(error)}
        </p>
      ) : backups.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No backups yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Date</span>
            <span>Items</span>
            <span>Size</span>
            <span className="text-right">File</span>
          </div>
          <div className="divide-y">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="grid gap-3 px-3 py-3 text-sm sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center"
              >
                <div>
                  <p className="font-medium">{formatDateOnly(backup.snapshotDate)}</p>
                  <p className="text-xs text-muted-foreground sm:hidden">
                    {backup.productCount.toLocaleString()} items / {formatBytes(backup.size)}
                  </p>
                </div>
                <p className="hidden tabular-nums sm:block">
                  {backup.productCount.toLocaleString()}
                </p>
                <p className="hidden tabular-nums sm:block">{formatBytes(backup.size)}</p>
                <div className="sm:flex sm:justify-end">
                  <DocumentDownloadLink
                    documentKey={backup.objectKey}
                    fileName={backup.fileName}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function configuredPlaceholder(last4: string | null) {
  return last4 ? `Configured ending in ${last4}` : "Configured";
}

function StripeIntegrationForm({ data }: { data: StripeIntegrationSettings }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(data.enabled);
  const [currency, setCurrency] = useState(data.currency || "usd");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const saveMut = useMutation({
    mutationFn: async () => {
      const body: {
        enabled: boolean;
        currency: string;
        secretKey?: string;
        webhookSecret?: string;
      } = {
        enabled,
        currency: currency.trim().toLowerCase(),
      };
      if (secretKey.trim()) body.secretKey = secretKey.trim();
      if (webhookSecret.trim()) body.webhookSecret = webhookSecret.trim();

      const { data: row } = await api.patch<StripeIntegrationSettings>(
        "/api/integrations/stripe",
        body,
      );
      return row;
    },
    onSuccess: (row) => {
      qc.setQueryData(stripeIntegrationKey, row);
      setSecretKey("");
      setWebhookSecret("");
      toast.success(row.enabled ? "Stripe payments enabled" : "Stripe settings saved");
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div className="rounded-lg border bg-background p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Stripe</h2>
          <p className="text-sm text-muted-foreground">
            Distributor New Order checkout.
          </p>
        </div>
        <Checkbox
          checked={enabled}
          onCheckedChange={(value) => setEnabled(value === true)}
          label="Enabled"
        />
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="stripe-currency">Currency</FieldLabel>
          <Input
            id="stripe-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            maxLength={3}
            autoComplete="off"
          />
        </Field>

        <div className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="stripe-secret-key">Secret key</FieldLabel>
            <Input
              id="stripe-secret-key"
              type="password"
              value={secretKey}
              onChange={(event) => setSecretKey(event.target.value)}
              placeholder={
                data.hasSecretKey ? configuredPlaceholder(data.secretKeyLast4) : "sk_test_..."
              }
              autoComplete="off"
            />
            {data.hasSecretKey ? (
              <FieldDescription>Leave blank to keep the saved key.</FieldDescription>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="stripe-webhook-secret">Webhook signing secret</FieldLabel>
            <Input
              id="stripe-webhook-secret"
              type="password"
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              placeholder={
                data.hasWebhookSecret
                  ? configuredPlaceholder(data.webhookSecretLast4)
                  : "whsec_..."
              }
              autoComplete="off"
            />
            {data.hasWebhookSecret ? (
              <FieldDescription>Leave blank to keep the saved secret.</FieldDescription>
            ) : null}
          </Field>
        </div>
      </FieldGroup>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
        >
          <Save className="size-4" />
          Save
        </Button>
        <p className="text-sm text-muted-foreground">
          Webhook: /api/payments/stripe/webhook
        </p>
      </div>
    </div>
  );
}

function ShopifyIntegrationForm({ data }: { data: ShopifyIntegrationSettings }) {
  const qc = useQueryClient();
  const [shopDomain, setShopDomain] = useState(data.shopDomain);
  const [enabled, setEnabled] = useState(data.enabled);
  const [accessToken, setAccessToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body: {
        shopDomain: string;
        enabled: boolean;
        accessToken?: string;
        webhookSecret?: string;
      } = {
        shopDomain,
        enabled,
      };
      if (accessToken.trim()) body.accessToken = accessToken.trim();
      if (webhookSecret.trim()) body.webhookSecret = webhookSecret.trim();

      const { data: row } = await api.patch<ShopifyIntegrationSettings>(
        "/api/integrations/shopify",
        body,
      );
      return row;
    },
    onSuccess: (row) => {
      qc.setQueryData(shopifyIntegrationKey, row);
      setAccessToken("");
      setWebhookSecret("");
      toast.success(row.enabled ? "Shopify integration enabled" : "Shopify integration saved");
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error)),
  });

  const syncMut = useMutation({
    mutationFn: async () => {
      const startedAt = Date.now();
      setSyncMessage("Starting Shopify sync...");
      console.info("[shopify-sync] Sync now clicked", {
        integrationId: data.id,
        shopDomain: data.shopDomain,
        enabled: data.enabled,
        hasAccessToken: data.hasAccessToken,
      });

      try {
        const result = await postSyncEventStream<ShopifySyncResult>(
          "/api/integrations/shopify/sync-now",
          {
            onEvent: (event) => {
              const message = syncProgressMessage("Shopify", event);
              if (message) setSyncMessage(message);
            },
          },
        );
        console.info("[shopify-sync] Sync now response", {
          integrationId: result.integrationId,
          skipped: result.skipped,
          reason: result.reason,
          lockExpiresAt: result.lockExpiresAt,
          syncedProductCount: result.syncedProductCount,
          matchedSkuCount: result.matchedSkuCount,
          unmatchedLocalSkuCount: result.unmatchedLocalSkuCount,
          syncedLocationCount: result.syncedLocationCount,
          syncedInventoryCount: result.syncedInventoryCount,
          movementCount: result.movementCount,
          durationMs: Date.now() - startedAt,
        });
        return result;
      } catch (error) {
        console.error("[shopify-sync] Sync now request failed", {
          integrationId: data.id,
          durationMs: Date.now() - startedAt,
          error: apiErrorMessage(error),
        });
        throw error;
      }
    },
    onSuccess: (result) => {
      setSyncMessage(null);
      qc.invalidateQueries({ queryKey: shopifyIntegrationKey });
      qc.invalidateQueries({ queryKey: productStockBackupsKey });
      qc.invalidateQueries({ queryKey: shopifyInventoryCountsKey });
      qc.invalidateQueries({ queryKey: shopifyInventoryMovementsKey });
      qc.invalidateQueries({ queryKey: ["products"] });
      if (result.skipped) {
        toast.info(result.reason ?? "Shopify sync skipped");
      } else {
        toast.success(
          `Synced ${result.syncedProductCount} product stock count(s), ${result.movementCount} movement(s)`,
        );
      }
    },
    onError: (error: unknown) => {
      setSyncMessage(null);
      toast.error(apiErrorMessage(error));
    },
  });

  const canSync = Boolean(data.enabled && data.hasAccessToken);
  const tokenPlaceholder = data.hasAccessToken ? "Configured" : "";
  const secretPlaceholder = data.hasWebhookSecret ? "Configured" : "";
  const statusTone = useMemo(() => {
    if (data.lastSyncStatus === "error") return "text-destructive";
    if (data.enabled) return "text-emerald-600 dark:text-emerald-400";
    return "text-muted-foreground";
  }, [data.enabled, data.lastSyncStatus]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-background p-4 sm:p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Shopify</h2>
            <p className="text-sm text-muted-foreground">
              Inventory sync for catalog stock counts.
            </p>
          </div>
          <Checkbox
            checked={enabled}
            onCheckedChange={(value) => setEnabled(value === true)}
            label="Enabled"
          />
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="shopify-shop-domain">Shop domain</FieldLabel>
            <Input
              id="shopify-shop-domain"
              value={shopDomain}
              onChange={(event) => setShopDomain(event.target.value)}
              placeholder="example.myshopify.com"
              autoComplete="off"
            />
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="shopify-access-token">Admin API token</FieldLabel>
              <Input
                id="shopify-access-token"
                type="password"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder={tokenPlaceholder}
                autoComplete="off"
              />
              {data.hasAccessToken ? (
                <FieldDescription>Leave blank to keep the saved token.</FieldDescription>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="shopify-webhook-secret">Webhook signing secret</FieldLabel>
              <Input
                id="shopify-webhook-secret"
                type="password"
                value={webhookSecret}
                onChange={(event) => setWebhookSecret(event.target.value)}
                placeholder={secretPlaceholder}
                autoComplete="off"
              />
              {data.hasWebhookSecret ? (
                <FieldDescription>Leave blank to keep the saved secret.</FieldDescription>
              ) : null}
            </Field>
          </div>
        </FieldGroup>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
          >
            <Save className="size-4" />
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => syncMut.mutate()}
            disabled={!canSync || syncMut.isPending}
          >
            <RefreshCw className={syncMut.isPending ? "size-4 animate-spin" : "size-4"} />
            Sync now
          </Button>
        </div>
        {syncMut.isPending && syncMessage ? (
          <p className="mt-3 text-sm text-muted-foreground">{syncMessage}</p>
        ) : null}
      </div>

      <div className="rounded-lg border bg-background p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <p className={`mt-1 text-sm font-medium ${statusTone}`}>
              {enabled ? statusLabel(data.lastSyncStatus) : "Disabled"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Last sync
            </p>
            <p className="mt-1 text-sm">{formatDate(data.lastSyncAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Products
            </p>
            <p className="mt-1 text-sm tabular-nums">
              {data.lastSyncedProductCount}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              SKUs
            </p>
            <p className="mt-1 text-sm tabular-nums">
              {data.lastMatchedSkuCount} matched
              <span className="text-muted-foreground">
                {" "}
                / {data.lastUnmatchedLocalSkuCount} unmatched
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Mirror
            </p>
            <p className="mt-1 text-sm tabular-nums">
              {data.lastSyncAt ? "Ready" : "Waiting"}
            </p>
          </div>
        </div>
        {data.lastSyncError ? (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {data.lastSyncError}
          </p>
        ) : null}
      </div>

      <ShopifyInventoryMirrorCard />
      <ProductStockBackupsCard />
    </div>
  );
}

function CjDropshippingIntegrationForm({
  data,
}: {
  data: CjDropshippingIntegrationSettings;
}) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(data.enabled);
  const [apiKey, setApiKey] = useState("");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body: {
        enabled: boolean;
        apiKey?: string;
      } = { enabled };
      if (apiKey.trim()) body.apiKey = apiKey.trim();

      const { data: row } = await api.patch<CjDropshippingIntegrationSettings>(
        "/api/integrations/cjdropshipping",
        body,
      );
      return row;
    },
    onSuccess: (row) => {
      qc.setQueryData(cjDropshippingIntegrationKey, row);
      setApiKey("");
      toast.success(
        row.enabled ? "CJdropshipping integration enabled" : "CJdropshipping settings saved",
      );
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error)),
  });

  const syncMut = useMutation({
    mutationFn: async () => {
      setSyncMessage("Starting CJdropshipping sync...");
      const result = await postSyncEventStream<CjDropshippingSyncResult>(
        "/api/integrations/cjdropshipping/sync-now",
        {
          onEvent: (event) => {
            const message = syncProgressMessage("CJdropshipping", event);
            if (message) setSyncMessage(message);
          },
        },
      );
      return result;
    },
    onSuccess: (result) => {
      setSyncMessage(null);
      qc.invalidateQueries({ queryKey: cjDropshippingIntegrationKey });
      qc.invalidateQueries({ queryKey: cjDropshippingInventoryCountsKey });
      qc.invalidateQueries({ queryKey: cjDropshippingInventoryTransactionsKey });
      qc.invalidateQueries({ queryKey: productStockBackupsKey });
      qc.invalidateQueries({ queryKey: ["products"] });
      if (result.skipped) {
        toast.info(result.reason ?? "CJdropshipping sync skipped");
      } else {
        toast.success(
          `Synced ${result.syncedSkuCount} SKU(s), ${result.syncedProductCount} product stock count(s), ${result.movementCount} transaction(s)`,
        );
      }
    },
    onError: (error: unknown) => {
      setSyncMessage(null);
      toast.error(apiErrorMessage(error));
    },
  });

  const canSync = Boolean(data.enabled && data.hasApiKey);
  const statusTone = useMemo(() => {
    if (data.lastSyncStatus === "error") return "text-destructive";
    if (data.enabled) return "text-emerald-600 dark:text-emerald-400";
    return "text-muted-foreground";
  }, [data.enabled, data.lastSyncStatus]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-background p-4 sm:p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">CJdropshipping</h2>
            <p className="text-sm text-muted-foreground">
              API-key authentication and SKU-based inventory sync.
            </p>
          </div>
          <Checkbox
            checked={enabled}
            onCheckedChange={(value) => setEnabled(value === true)}
            label="Enabled"
          />
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="cjdropshipping-api-key">API key</FieldLabel>
            <Input
              id="cjdropshipping-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={data.hasApiKey ? "Configured" : "Paste CJdropshipping API key"}
              autoComplete="off"
            />
            {data.hasApiKey ? (
              <FieldDescription>Leave blank to keep the saved API key.</FieldDescription>
            ) : (
              <FieldDescription>
                The key is exchanged for CJ access and refresh tokens on save.
              </FieldDescription>
            )}
          </Field>
        </FieldGroup>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
          >
            <Save className="size-4" />
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => syncMut.mutate()}
            disabled={!canSync || syncMut.isPending}
          >
            <RefreshCw className={syncMut.isPending ? "size-4 animate-spin" : "size-4"} />
            Sync now
          </Button>
        </div>
        {syncMut.isPending && syncMessage ? (
          <p className="mt-3 text-sm text-muted-foreground">{syncMessage}</p>
        ) : null}
      </div>

      <div className="rounded-lg border bg-background p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <p className={`mt-1 text-sm font-medium ${statusTone}`}>
              {enabled ? statusLabel(data.lastSyncStatus) : "Disabled"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Last sync
            </p>
            <p className="mt-1 text-sm">{formatDate(data.lastSyncAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              SKUs
            </p>
            <p className="mt-1 text-sm tabular-nums">
              {data.lastMatchedSkuCount} matched
              <span className="text-muted-foreground">
                {" "}
                / {data.lastSyncedSkuCount} checked
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Unmatched
            </p>
            <p className="mt-1 text-sm tabular-nums">
              {data.lastUnmatchedCjSkuCount} CJ
              <span className="text-muted-foreground">
                {" "}
                / {data.lastUnmatchedLocalSkuCount} local
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Mirror
            </p>
            <p className="mt-1 text-sm tabular-nums">
              {data.lastSyncedInventoryCount} counts
              <span className="text-muted-foreground">
                {" "}
                / {data.lastMovementCount} txns
              </span>
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
          <p>Access token expires: {formatDate(data.accessTokenExpiresAt)}</p>
          <p>Refresh token expires: {formatDate(data.refreshTokenExpiresAt)}</p>
        </div>
        {data.openId ? (
          <p className="mt-2 text-sm text-muted-foreground">CJ open ID: {data.openId}</p>
        ) : null}
        {data.lastSyncError ? (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {data.lastSyncError}
          </p>
        ) : null}
      </div>

      <CjDropshippingInventoryMirrorCard />
    </div>
  );
}

export function IntegrationsSettingsView() {
  const { data: shopifyData, isPending: shopifyPending } = useQuery({
    queryKey: shopifyIntegrationKey,
    queryFn: async () => {
      const { data: row } = await api.get<ShopifyIntegrationSettings>(
        "/api/integrations/shopify",
      );
      return row;
    },
  });
  const { data: cjDropshippingData, isPending: cjDropshippingPending } = useQuery({
    queryKey: cjDropshippingIntegrationKey,
    queryFn: async () => {
      const { data: row } = await api.get<CjDropshippingIntegrationSettings>(
        "/api/integrations/cjdropshipping",
      );
      return row;
    },
  });
  const { data: stripeData, isPending: stripePending } = useQuery({
    queryKey: stripeIntegrationKey,
    queryFn: async () => {
      const { data: row } = await api.get<StripeIntegrationSettings>(
        "/api/integrations/stripe",
      );
      return row;
    },
  });

  if (
    shopifyPending ||
    cjDropshippingPending ||
    stripePending ||
    !shopifyData ||
    !cjDropshippingData ||
    !stripeData
  ) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <StripeIntegrationForm
        key={`stripe:${stripeData.id ?? "new"}:${stripeData.updatedAt ?? "never"}:${stripeData.enabled}`}
        data={stripeData}
      />
      <ShopifyIntegrationForm
        key={`shopify:${shopifyData.id ?? "new"}:${shopifyData.updatedAt ?? "never"}:${shopifyData.enabled}`}
        data={shopifyData}
      />
      <CjDropshippingIntegrationForm
        key={`cjdropshipping:${cjDropshippingData.id ?? "new"}:${cjDropshippingData.updatedAt ?? "never"}:${cjDropshippingData.enabled}`}
        data={cjDropshippingData}
      />
    </div>
  );
}
