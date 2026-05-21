"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "nextjs-toploader/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import { invalidateNavCounts } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";
import type {
  PurchaseOrderDetail,
  PurchaseOrderSummary,
  Warehouse,
  WarehouseOrderDetail,
} from "@/lib/types/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { StorageObjectImage } from "@/components/ui/storage-object-image";

type DistributorPoDetail = Extract<PurchaseOrderDetail, { type: "distributor" }>;

function lineRemaining(line: DistributorPoDetail["lines"][number]) {
  const moQuantity = line.allocations.reduce((sum, row) => sum + row.quantity, 0);
  const woQuantity = line.warehouseAllocations.reduce((sum, row) => sum + row.quantity, 0);
  return Math.max(0, line.quantity - moQuantity - woQuantity);
}

export function NewWarehouseOrderWizard() {
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [selectedPoIds, setSelectedPoIds] = useState<string[]>([]);
  const [lineQuantities, setLineQuantities] = useState<Record<string, number>>({});

  const { data: warehouses = [], isPending: warehousesPending } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await api.get<Warehouse[]>("/api/warehouses");
      return data;
    },
  });

  const { data: purchaseOrders = [], isPending: purchaseOrdersPending } = useQuery({
    queryKey: ["purchase-orders", "warehouse-order-new"],
    queryFn: async () => {
      const { data } = await api.get<PurchaseOrderSummary[]>("/api/purchase-orders", {
        params: { status: "open" },
      });
      return data.filter((order) => !order.isBackOrder);
    },
  });

  const { data: selectedPoDetails = [], isFetching: selectedPoDetailsFetching } = useQuery({
    queryKey: ["purchase-orders", "warehouse-order-new-details", selectedPoIds],
    queryFn: async () => {
      const rows = await Promise.all(
        selectedPoIds.map(async (id) => {
          const { data } = await api.get<DistributorPoDetail>(`/api/purchase-orders/${id}`);
          return data;
        }),
      );
      return rows;
    },
    enabled: selectedPoIds.length > 0,
  });

  const lineRows = useMemo(
    () =>
      selectedPoDetails.flatMap((po) =>
        po.lines.map((line) => ({
          po,
          line,
          remaining: lineRemaining(line),
        })),
      ),
    [selectedPoDetails],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const lines = lineRows
        .map(({ line }) => ({
          purchaseOrderLineId: line.id,
          quantity: Math.trunc(lineQuantities[line.id] ?? 0),
        }))
        .filter((line) => line.quantity > 0);

      const { data } = await api.post<WarehouseOrderDetail>("/api/warehouse-orders", {
        name: name.trim(),
        warehouseId,
        purchaseOrderIds: selectedPoIds,
        lines,
      });
      return data;
    },
    onSuccess: async (row) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["warehouse-orders"] }),
        qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
        invalidateNavCounts(qc),
      ]);
      toast.success("Warehouse order created");
      router.push(`/warehouse-orders/${row.id}`);
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const selectedLineCount = Object.values(lineQuantities).filter((qty) => qty > 0).length;
  const canCreate =
    name.trim().length > 0 &&
    warehouseId.length > 0 &&
    selectedPoIds.length > 0 &&
    selectedLineCount > 0 &&
    !selectedPoDetailsFetching;

  function togglePo(id: string, checked: boolean) {
    setSelectedPoIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((poId) => poId !== id),
    );
    if (!checked) {
      const detail = selectedPoDetails.find((po) => po.id === id);
      if (detail) {
        setLineQuantities((prev) => {
          const next = { ...prev };
          for (const line of detail.lines) delete next[line.id];
          return next;
        });
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <Link
          href="/warehouse-orders"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2 -ml-2")}
        >
          <ChevronLeft className="size-4" />
          Back to list
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New warehouse order</h1>
        <p className="text-sm text-muted-foreground">
          Select distributor PO lines and quantities to fulfill from a warehouse.
        </p>
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>Name the WO and choose the source warehouse.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wo-name" required>
              Name
            </Label>
            <Input
              id="wo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Warehouse fulfillment batch"
            />
          </div>
          <div className="space-y-2">
            <Label required>Warehouse</Label>
            <Select
              value={warehouseId}
              items={warehouses.map((warehouse) => ({
                value: warehouse.id,
                label: warehouse.name,
              }))}
              disabled={warehousesPending}
              onValueChange={(v) => {
                if (v) setWarehouseId(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={warehousesPending ? "Loading..." : "Select warehouse"} />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!warehousesPending && warehouses.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Add a warehouse under{" "}
                <Link href="/warehouses" className="font-medium text-primary hover:underline">
                  Warehouses
                </Link>{" "}
                first.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>Purchase orders</CardTitle>
          <CardDescription>Choose open distributor POs for this warehouse order.</CardDescription>
        </CardHeader>
        <CardContent>
          {purchaseOrdersPending ? (
            <p className="py-6 text-sm text-muted-foreground">Loading purchase orders...</p>
          ) : purchaseOrders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 py-8 text-center text-sm text-muted-foreground">
              No open distributor purchase orders.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {purchaseOrders.map((po) => {
                const checked = selectedPoIds.includes(po.id);
                return (
                  <label
                    key={po.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => togglePo(po.id, value === true)}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{po.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        PO #{po.number}
                        {po.saleChannel?.name ? ` - ${po.saleChannel.name}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <CardDescription>Enter the quantity that will ship from the warehouse.</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedPoDetailsFetching ? (
            <p className="py-6 text-sm text-muted-foreground">Loading lines...</p>
          ) : lineRows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 py-8 text-center text-sm text-muted-foreground">
              Select purchase orders to choose lines.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead className="w-28">Available</TableHead>
                    <TableHead className="w-32">WO qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineRows.map(({ po, line, remaining }) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <StorageObjectImage
                            reference={line.product.imageKey}
                            alt=""
                            className="size-10 shrink-0 rounded-md"
                            imgClassName="rounded-md"
                            objectFit="contain"
                          />
                          <div className="min-w-0">
                            <p className="font-medium">{line.product.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {line.product.sku}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {po.name}
                        <span className="block text-xs text-muted-foreground">
                          PO #{po.number}
                        </span>
                      </TableCell>
                      <TableCell>{remaining}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          value={lineQuantities[line.id] ?? 0}
                          disabled={remaining <= 0}
                          onChange={(event) => {
                            const next = Math.max(
                              0,
                              Math.min(remaining, Number(event.target.value) || 0),
                            );
                            setLineQuantities((prev) => ({ ...prev, [line.id]: next }));
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" disabled={!canCreate || createMut.isPending} onClick={() => createMut.mutate()}>
          {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Create warehouse order"}
        </Button>
      </div>
    </div>
  );
}
