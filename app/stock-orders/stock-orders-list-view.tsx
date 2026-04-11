"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
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
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Manufacturer, Product, PurchaseOrderSummary } from "@/lib/types/api";
import {
  distributorPoStatusLabels,
  distributorPoStatuses,
} from "@/lib/po/status-labels";
import {
  ExpandableOrderSummaryRow,
  ExpandableOrderSummaryTableHead,
} from "@/components/po/order-list-expandable-row";
import { ProductUpsertDialog } from "@/components/po/products/product-upsert-dialog";
import type { ProductFormValues } from "@/components/po/products/product-form";

import { PO_LIST_ALL_SCOPE_ID } from "../purchase-orders/purchase-orders-list-view";

const soListKey = ["stock-orders", "list"] as const;
const soOpenCountsKey = ["stock-orders", "open-counts"] as const;
const manufacturersKey = ["manufacturers"] as const;
const productsKey = ["products"] as const;

function EntityTabRow({
  items,
  selectedId,
  onSelect,
  emptyMessage,
  label,
  allCountLabel,
}: {
  items: { id: string; name: string; logoKey: string | null; openCount: number | null }[];
  selectedId: string;
  onSelect: (id: string) => void;
  emptyMessage: string;
  label: string;
  allCountLabel: string;
}) {
  const allActive = selectedId === PO_LIST_ALL_SCOPE_ID;
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
          aria-label={`All, ${allCountLabel}`}
          title={`All (${allCountLabel})`}
          onClick={() => onSelect(PO_LIST_ALL_SCOPE_ID)}
          className={cn(
            "relative flex min-h-11 shrink-0 items-center justify-center border-b-2 border-transparent px-3 py-2.5 text-sm font-medium transition-colors",
            "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
            allActive
              ? "-mb-px border-primary text-foreground"
              : "text-muted-foreground hover:border-border",
          )}
        >
          All
        </button>
        {items.map((item) => {
          const active = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={item.name}
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

function SoListFiltersAndTable({
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
                <ExpandableOrderSummaryRow key={row.id} row={row} apiScope="stock-orders" onEditProduct={onEditProduct} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function StockOrdersListView() {
  const qc = useQueryClient();
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

  const { data: manufacturers = [] } = useQuery({
    queryKey: manufacturersKey,
    queryFn: async () => {
      const { data: rows } = await api.get<Manufacturer[]>("/api/manufacturers");
      return rows;
    },
  });

  const { data: openCounts, isPending: openCountsPending } = useQuery({
    queryKey: soOpenCountsKey,
    queryFn: async () => {
      const { data } = await api.get<{
        byManufacturer: Record<string, number>;
      }>("/api/stock-orders/open-counts");
      return data;
    },
  });

  const manufacturerItems = manufacturers.map((m) => ({
    ...m,
    openCount: openCountsPending ? null : (openCounts?.byManufacturer[m.id] ?? 0),
  }));

  const filterReady =
    selectedManufacturerId === PO_LIST_ALL_SCOPE_ID ||
    manufacturers.some((m) => m.id === selectedManufacturerId);

  const queryKey = [...soListKey, debouncedQ, status, selectedManufacturerId] as const;

  const { data = [], isPending } = useQuery({
    queryKey,
    enabled: filterReady,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (status !== "all") params.set("status", status);
      if (
        selectedManufacturerId &&
        selectedManufacturerId !== PO_LIST_ALL_SCOPE_ID
      ) {
        params.set("manufacturerId", selectedManufacturerId);
      }
      const qs = params.toString();
      const { data: rows } = await api.get<PurchaseOrderSummary[]>(
        `/api/stock-orders${qs ? `?${qs}` : ""}`,
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
      qc.invalidateQueries({ queryKey: soListKey });
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
    if (payload.patchImageKey) body.imageKey = payload.values.imageKey;
    if (payload.patchBarcodeKey) body.barcodeKey = payload.values.barcodeKey;
    if (payload.patchPackagingKey) body.packagingKey = payload.values.packagingKey;
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
          <h1 className="text-2xl font-semibold tracking-tight">Stock orders</h1>
          <p className="text-sm text-muted-foreground">
            Internal stock orders by manufacturer involvement (via MO line allocations), then filter
            by status.
          </p>
        </div>
        <Link href="/stock-orders/new" className={cn(buttonVariants(), "inline-flex gap-1.5")}>
          <Plus className="size-4" />
          New stock order
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
        <div className="space-y-5 p-5 pt-4">
          <EntityTabRow
            items={manufacturerItems}
            selectedId={selectedManufacturerId}
            onSelect={setSelectedManufacturerId}
            emptyMessage="No manufacturers yet. Add one under Manufacturers."
            label="Manufacturer"
            allCountLabel="all manufacturers"
          />
          <SoListFiltersAndTable
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
                ? "No stock orders match your filters."
                : "No stock orders for this manufacturer match your filters."
            }
            onEditProduct={onEditProduct}
          />
        </div>
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
