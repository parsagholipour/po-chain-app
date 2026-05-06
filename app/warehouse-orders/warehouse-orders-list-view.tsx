"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/lib/axios";
import { cn } from "@/lib/utils";
import type { Warehouse, WarehouseOrderSummary } from "@/lib/types/api";
import {
  shippingStatusLabels,
  statusBadgeClassName,
  warehouseOrderStatusLabels,
  warehouseOrderStatuses,
} from "@/lib/po/status-labels";
import { usePagination } from "@/hooks/use-pagination";
import { Badge } from "@/components/ui/badge";
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
import { TableContainer } from "@/components/ui/table-container";
import { TablePagination } from "@/components/ui/table-pagination";

const WO_LIST_ALL_SCOPE_ID = "__all__";
const woListKey = ["warehouse-orders", "list"] as const;

export function WarehouseOrdersListView() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("all");
  const [warehouseId, setWarehouseId] = useState(WO_LIST_ALL_SCOPE_ID);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: warehouses = [], isPending: warehousesPending } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await api.get<Warehouse[]>("/api/warehouses");
      return data;
    },
  });

  const filterReady =
    warehouseId === WO_LIST_ALL_SCOPE_ID ||
    warehouses.some((warehouse) => warehouse.id === warehouseId);

  const { data = [], isPending } = useQuery({
    queryKey: [...woListKey, debouncedQ, status, warehouseId],
    enabled: filterReady,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (status !== "all") params.set("status", status);
      if (warehouseId !== WO_LIST_ALL_SCOPE_ID) params.set("warehouseId", warehouseId);
      const qs = params.toString();
      const { data } = await api.get<WarehouseOrderSummary[]>(
        `/api/warehouse-orders${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
  });

  const pagination = usePagination({
    totalItems: data.length,
    resetDeps: [debouncedQ, status, warehouseId],
  });
  const pagedRows = pagination.sliceItems(data);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Warehouse orders</h1>
          <p className="text-sm text-muted-foreground">
            Fulfill distributor purchase orders directly from warehouse inventory.
          </p>
        </div>
        <Link
          href="/warehouse-orders/new"
          className={cn(buttonVariants(), "inline-flex gap-1.5")}
        >
          <Plus className="size-4" />
          New warehouse order
        </Link>
      </div>

      <TableContainer
        className="shadow-sm"
        footer={
          <TablePagination
            {...pagination}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        }
      >
        <div className="space-y-5 p-5 pt-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-xs"
              disabled={!filterReady}
            />
            <Select
              value={status}
              onValueChange={(v) => {
                if (v) setStatus(v);
              }}
              disabled={!filterReady}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {warehouseOrderStatuses.map((value) => (
                  <SelectItem key={value} value={value}>
                    {warehouseOrderStatusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={warehouseId}
              onValueChange={(v) => {
                if (v) setWarehouseId(v);
              }}
              disabled={warehousesPending}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Warehouse" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WO_LIST_ALL_SCOPE_ID}>All warehouses</SelectItem>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="min-w-[10rem]">Warehouse</TableHead>
                  <TableHead className="min-w-[12rem]">Linked POs</TableHead>
                  <TableHead className="min-w-[10rem]">Status</TableHead>
                  <TableHead className="w-40">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!filterReady ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : isPending ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : pagedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                      No warehouse orders match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link href={`/warehouse-orders/${row.id}`} className="font-medium hover:underline">
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell>{row.warehouse.name}</TableCell>
                      <TableCell>
                        {row.linkedOrders.length === 0 ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {row.linkedOrders.map((order) => (
                              <span key={order.id} className="text-sm">
                                {order.name}
                                {order.saleChannelName ? (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    - {order.saleChannelName}
                                  </span>
                                ) : null}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          <Badge
                            variant="secondary"
                            className={statusBadgeClassName(row.status)}
                          >
                            {warehouseOrderStatusLabels[row.status] ?? row.status}
                          </Badge>
                          {row.shippingBadges.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-medium text-foreground">
                                Shipping
                              </span>
                              {row.shippingBadges.map((shipping) => (
                                <Badge
                                  key={shipping.id}
                                  variant="outline"
                                  className={`${statusBadgeClassName(shipping.status)} text-[10px] font-medium`}
                                >
                                  {shippingStatusLabels[shipping.status] ?? shipping.status}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </TableContainer>
    </div>
  );
}
