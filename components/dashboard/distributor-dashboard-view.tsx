"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Package, Truck } from "lucide-react";
import { api } from "@/lib/axios";
import type { PurchaseOrderSummary, ShippingRow } from "@/lib/types/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { shippingStatusLabels, statusBadgeClassName } from "@/lib/po/status-labels";

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="border-border/80">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-primary" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

export function DistributorDashboardView() {
  const purchaseOrders = useQuery({
    queryKey: ["dashboard", "distributor", "purchase-orders"],
    queryFn: async () =>
      (await api.get<PurchaseOrderSummary[]>("/api/purchase-orders")).data,
  });
  const shipping = useQuery({
    queryKey: ["dashboard", "distributor", "shipping"],
    queryFn: async () =>
      (await api.get<ShippingRow[]>("/api/shipping?type=purchase_order")).data,
  });

  const poRows = purchaseOrders.data ?? [];
  const shippingRows = shipping.data ?? [];
  const openPoCount = poRows.filter((po) => po.status !== "closed").length;
  const activeShippingCount = shippingRows.filter((row) =>
    row.status === "pending" || row.status === "in_transit",
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Distributor dashboard</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Your purchase orders and related shipping updates.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={ClipboardList} label="Purchase orders" value={poRows.length} />
        <MetricCard icon={Package} label="Open purchase orders" value={openPoCount} />
        <MetricCard icon={Truck} label="Active shipments" value={activeShippingCount} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Recent purchase orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {purchaseOrders.isPending ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : poRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
            ) : (
              poRows.slice(0, 5).map((po) => (
                <Link
                  key={po.id}
                  href={`/purchase-orders/${po.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <span className="min-w-0 truncate font-medium">{po.name}</span>
                  <Badge variant="secondary">{po.status.replaceAll("_", " ")}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Recent shipments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {shipping.isPending ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : shippingRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shipments yet.</p>
            ) : (
              shippingRows.slice(0, 5).map((row) => (
                <Link
                  key={row.id}
                  href={`/shipping?id=${row.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <span className="min-w-0 truncate font-mono">{row.trackingNumber}</span>
                  <Badge variant="secondary" className={statusBadgeClassName(row.status)}>
                    {shippingStatusLabels[row.status] ?? row.status}
                  </Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
