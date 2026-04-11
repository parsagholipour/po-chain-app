"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/axios";
import { buttonVariants } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/api-error-message";
import { cn } from "@/lib/utils";
import type { Manufacturer, Product, PurchaseOrderSummary, SaleChannel } from "@/lib/types/api";
import {
  distributorPoStatusLabels,
  distributorPoStatuses,
} from "@/lib/po/status-labels";
import { ProductUpsertDialog } from "@/components/po/products/product-upsert-dialog";
import type { ProductFormValues } from "@/components/po/products/product-form";
import {
  ExpandableOrderSummaryRow,
  ExpandableOrderSummaryTableHead,
} from "@/components/po/order-list-expandable-row";

export type { PurchaseOrderSummary } from "@/lib/types/api";

const poListKey = ["purchase-orders", "list"] as const;
const poOpenCountsKey = ["purchase-orders", "open-counts"] as const;
const saleChannelsKey = ["sale-channels"] as const;
const manufacturersKey = ["manufacturers"] as const;
const productsKey = ["products"] as const;

/** Subtab value: list POs across all sale channels or all manufacturers (no scope filter). */
export const PO_LIST_ALL_SCOPE_ID = "__all__";

type Perspective = "sale_channels" | "manufacturers";

function EntityTabRow({
  items,
  selectedId,
  onSelect,
  emptyMessage,
  label,
  allOpenCount,
  allCountLabel,
}: {
  items: { id: string; name: string; logoKey: string | null; openCount: number | null }[];
  selectedId: string;
  onSelect: (id: string) => void;
  emptyMessage: string;
  label: string;
  /** Omit to hide open-count on "All". `null` = loading; number = total non-closed (e.g. sum by channel). */
  allOpenCount?: number | null;
  /** e.g. "all sale channels" for aria/title. */
  allCountLabel: string;
}) {
  const allActive = selectedId === PO_LIST_ALL_SCOPE_ID;
  const allCountPhrase =
    allOpenCount === undefined
      ? undefined
      : allOpenCount === null
        ? undefined
        : allOpenCount === 0
          ? "no open / in-transit POs"
          : `${allOpenCount} open or in-transit PO${allOpenCount === 1 ? "" : "s"}`;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div
        className="-mx-1 flex max-w-full gap-0 overflow-x-auto border-b border-border px-1 pb-px"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={allActive}
          aria-label={
            allCountPhrase
              ? `All, ${allCountPhrase}`
              : allOpenCount === null
                ? `All, ${allCountLabel}, loading counts`
                : `All, ${allCountLabel}`
          }
          title={allCountPhrase ? `All — ${allCountPhrase}` : `All (${allCountLabel})`}
          onClick={() => onSelect(PO_LIST_ALL_SCOPE_ID)}
          className={cn(
            "relative flex min-h-11 shrink-0 items-center justify-center border-b-2 border-transparent px-3 py-2.5 text-sm font-medium transition-colors",
            "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
            allActive
              ? "-mb-px border-primary text-foreground"
              : "text-muted-foreground hover:border-border",
          )}
        >
          <span className="inline-flex items-center gap-2">
            All
            {allOpenCount === undefined ? null : allOpenCount === null ? (
              <span
                className="h-5 w-7 shrink-0 rounded-md bg-muted animate-pulse"
                aria-hidden
              />
            ) : allOpenCount > 0 ? (
              <Badge
                variant={allActive ? "default" : "secondary"}
                className="h-5 min-w-5 shrink-0 justify-center px-1.5 tabular-nums text-[10px] font-semibold"
              >
                {allOpenCount > 99 ? "99+" : allOpenCount}
              </Badge>
            ) : null}
          </span>
        </button>
        {items.map((item) => {
          const active = item.id === selectedId;
          const countPhrase =
            item.openCount === null
              ? undefined
              : item.openCount === 0
                ? "no open / in-transit POs"
                : `${item.openCount} open or in-transit PO${item.openCount === 1 ? "" : "s"}`;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={countPhrase ? `${item.name}, ${countPhrase}` : `${item.name}, loading counts`}
              title={countPhrase ? `${item.name} — ${countPhrase}` : item.name}
              onClick={() => onSelect(item.id)}
              className={cn(
                "relative flex min-h-11 min-w-14 shrink-0 items-center justify-center border-b-2 border-transparent px-3 py-2.5 text-sm font-medium transition-colors",
                "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                active
                  ? "-mb-px border-primary text-foreground"
                  : "text-muted-foreground hover:border-border",
              )}
            >
              <span className="inline-flex max-w-[min(100%,9rem)] items-center gap-2">
                <StorageObjectImage
                  reference={item.logoKey}
                  className="h-7 max-h-7 w-auto max-w-[min(100%,6.5rem)] shrink-0 bg-muted/20"
                  objectFit="contain"
                  fallback={
                    <span className="block max-w-[6.5rem] truncate text-center text-xs leading-tight">
                      {item.name}
                    </span>
                  }
                />
                {item.openCount === null ? (
                  <span
                    className="h-5 w-7 shrink-0 rounded-md bg-muted animate-pulse"
                    aria-hidden
                  />
                ) : item.openCount > 0 ? (
                  <Badge
                    variant={active ? "default" : "secondary"}
                    className="h-5 min-w-5 shrink-0 justify-center px-1.5 tabular-nums text-[10px] font-semibold"
                  >
                    {item.openCount > 99 ? "99+" : item.openCount}
                  </Badge>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : null}
    </div>
  );
}

function PoListFiltersAndTable({
  q,
  onQChange,
  status,
  onStatusChange,
  filterReady,
  isPending,
  data,
  emptyNoScopeMessage,
  emptyFilteredMessage,
  onEditProduct,
}: {
  q: string;
  onQChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  filterReady: boolean;
  isPending: boolean;
  data: PurchaseOrderSummary[];
  emptyNoScopeMessage: string;
  emptyFilteredMessage: string;
  onEditProduct?: (product: Product) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search…"
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          className="max-w-xs"
          disabled={!filterReady}
        />
        <Select
          value={status}
          onValueChange={(v) => {
            if (v) onStatusChange(v);
          }}
          disabled={!filterReady}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {distributorPoStatuses.map((value) => (
              <SelectItem key={value} value={value}>
                {distributorPoStatusLabels[value] ?? value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <ExpandableOrderSummaryTableHead />
              <TableHead className="w-24">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="min-w-[12rem]">Status</TableHead>
              <TableHead className="w-40">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!filterReady ? (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                  {emptyNoScopeMessage}
                </TableCell>
              </TableRow>
            ) : isPending ? (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                  {emptyFilteredMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <ExpandableOrderSummaryRow
                  key={row.id}
                  row={row}
                  apiScope="purchase-orders"
                  onEditProduct={onEditProduct}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function PurchaseOrdersListView() {
  const qc = useQueryClient();
  const [perspective, setPerspective] = useState<Perspective>("sale_channels");
  const [selectedSaleChannelId, setSelectedSaleChannelId] = useState<string>(
    PO_LIST_ALL_SCOPE_ID,
  );
  const [selectedManufacturerId, setSelectedManufacturerId] = useState<string>(
    PO_LIST_ALL_SCOPE_ID,
  );
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [productEditOpen, setProductEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: saleChannels = [] } = useQuery({
    queryKey: saleChannelsKey,
    queryFn: async () => {
      const { data: rows } = await api.get<SaleChannel[]>("/api/sale-channels");
      return rows;
    },
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: manufacturersKey,
    queryFn: async () => {
      const { data: rows } = await api.get<Manufacturer[]>("/api/manufacturers");
      return rows;
    },
  });

  const { data: openCounts, isPending: openCountsPending } = useQuery({
    queryKey: poOpenCountsKey,
    queryFn: async () => {
      const { data } = await api.get<{
        bySaleChannel: Record<string, number>;
        byManufacturer: Record<string, number>;
      }>("/api/purchase-orders/open-counts");
      return data;
    },
  });

  const saleChannelItems = saleChannels.map((c) => ({
    ...c,
    openCount: openCountsPending ? null : (openCounts?.bySaleChannel[c.id] ?? 0),
  }));

  const manufacturerItems = manufacturers.map((m) => ({
    ...m,
    openCount: openCountsPending ? null : (openCounts?.byManufacturer[m.id] ?? 0),
  }));

  const saleChannelAllOpenCount = openCountsPending
    ? null
    : saleChannelItems.reduce((sum, c) => sum + (c.openCount ?? 0), 0);

  const filterReady =
    perspective === "sale_channels"
      ? selectedSaleChannelId === PO_LIST_ALL_SCOPE_ID ||
        saleChannels.some((c) => c.id === selectedSaleChannelId)
      : selectedManufacturerId === PO_LIST_ALL_SCOPE_ID ||
        manufacturers.some((m) => m.id === selectedManufacturerId);

  const queryKey = [
    ...poListKey,
    debouncedQ,
    status,
    perspective,
    selectedSaleChannelId,
    selectedManufacturerId,
  ] as const;

  const { data = [], isPending } = useQuery({
    queryKey,
    enabled: filterReady,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (status !== "all") params.set("status", status);
      if (
        perspective === "sale_channels" &&
        selectedSaleChannelId &&
        selectedSaleChannelId !== PO_LIST_ALL_SCOPE_ID
      ) {
        params.set("saleChannelId", selectedSaleChannelId);
      }
      if (
        perspective === "manufacturers" &&
        selectedManufacturerId &&
        selectedManufacturerId !== PO_LIST_ALL_SCOPE_ID
      ) {
        params.set("manufacturerId", selectedManufacturerId);
      }
      const qs = params.toString();
      const { data: rows } = await api.get<PurchaseOrderSummary[]>(
        `/api/purchase-orders${qs ? `?${qs}` : ""}`,
      );
      return rows;
    },
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const { data } = await api.patch<Product>(`/api/products/${id}`, body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productsKey });
      qc.invalidateQueries({ queryKey: poListKey });
      toast.success("Product updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function saveProduct(payload: {
    id?: string;
    values: ProductFormValues;
    patchImageKey: boolean;
    patchBarcodeKey: boolean;
    patchPackagingKey: boolean;
  }) {
    if (!payload.id) return;
    const body: Record<string, unknown> = {
      name: payload.values.name,
      sku: payload.values.sku,
      defaultManufacturerId: payload.values.defaultManufacturerId,
      verified: payload.values.verified,
    };
    if (payload.patchImageKey) {
      body.imageKey = payload.values.imageKey;
    }
    if (payload.patchBarcodeKey) {
      body.barcodeKey = payload.values.barcodeKey;
    }
    if (payload.patchPackagingKey) {
      body.packagingKey = payload.values.packagingKey;
    }
    await updateProduct.mutateAsync({ id: payload.id, body });
  }

  const onEditProduct =
    manufacturers.length > 0
      ? (product: Product) => {
          setEditingProduct(product);
          setProductEditOpen(true);
        }
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase orders</h1>
          <p className="text-sm text-muted-foreground">
            Distributor orders by channel or manufacturer involvement, then filter by PO status.
          </p>
        </div>
        <Link
          href="/purchase-orders/new"
          className={cn(buttonVariants(), "inline-flex gap-1.5")}
        >
          <Plus className="size-4" />
          New purchase order
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
        <Tabs
          value={perspective}
          onValueChange={(v) => {
            if (v === "sale_channels" || v === "manufacturers") setPerspective(v);
          }}
          className="gap-0"
        >
          <TabsList
            variant="line"
            className="h-auto min-h-12 w-full justify-start gap-8 rounded-none border-0 border-b border-border bg-muted/30 px-4"
          >
            <TabsTrigger
              value="sale_channels"
              className="rounded-none border-0 bg-transparent px-0 py-3 shadow-none data-active:bg-transparent data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent"
            >
              By sale channel
            </TabsTrigger>
            <TabsTrigger
              value="manufacturers"
              className="rounded-none border-0 bg-transparent px-0 py-3 shadow-none data-active:bg-transparent data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent"
            >
              By manufacturer
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sale_channels" className="mt-0 outline-none">
            <div className="space-y-5 p-5 pt-4">
              <EntityTabRow
                items={saleChannelItems}
                selectedId={selectedSaleChannelId}
                onSelect={setSelectedSaleChannelId}
                emptyMessage="No sale channels yet. Add one under Sale channels."
                label="Sale channel"
                allOpenCount={saleChannelAllOpenCount}
                allCountLabel="all sale channels"
              />
              <PoListFiltersAndTable
                q={q}
                onQChange={setQ}
                status={status}
                onStatusChange={setStatus}
                filterReady={filterReady}
                isPending={isPending}
                data={data}
                emptyNoScopeMessage="Loading…"
                emptyFilteredMessage={
                  selectedSaleChannelId === PO_LIST_ALL_SCOPE_ID
                    ? "No purchase orders match your filters."
                    : "No purchase orders for this channel match your filters."
                }
                onEditProduct={onEditProduct}
              />
            </div>
          </TabsContent>

          <TabsContent value="manufacturers" className="mt-0 outline-none">
            <div className="space-y-5 p-5 pt-4">
              <EntityTabRow
                items={manufacturerItems}
                selectedId={selectedManufacturerId}
                onSelect={setSelectedManufacturerId}
                emptyMessage="No manufacturers yet. Add one under Manufacturers."
                label="Manufacturer"
                allCountLabel="all manufacturers"
              />
              <PoListFiltersAndTable
                q={q}
                onQChange={setQ}
                status={status}
                onStatusChange={setStatus}
                filterReady={filterReady}
                isPending={isPending}
                data={data}
                emptyNoScopeMessage="Loading…"
                emptyFilteredMessage={
                  selectedManufacturerId === PO_LIST_ALL_SCOPE_ID
                    ? "No purchase orders match your filters."
                    : "No purchase orders for this manufacturer match your filters."
                }
                onEditProduct={onEditProduct}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ProductUpsertDialog
        open={productEditOpen}
        onOpenChange={(o) => {
          setProductEditOpen(o);
          if (!o) setEditingProduct(null);
        }}
        editing={editingProduct}
        manufacturers={manufacturers}
        onSave={saveProduct}
      />
    </div>
  );
}
