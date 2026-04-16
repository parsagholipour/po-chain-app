"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Package } from "lucide-react";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { KpiCard } from "@/components/analytics/kpi-card";
import { LineChart } from "@/components/analytics/charts/line-chart";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { DoughnutChart } from "@/components/analytics/charts/doughnut-chart";
import { CHART_COLORS } from "@/components/analytics/charts/chart-setup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/axios";
import type { AnalyticsKpi, BreakdownRow, ProductLeaderboardRow, TimeSeriesPoint } from "@/lib/types/analytics";

type OverviewPayload = {
  kpis: AnalyticsKpi[];
  trend: TimeSeriesPoint[];
  topProducts: ProductLeaderboardRow[];
};

type BreakdownPayload = { rows: BreakdownRow[] };

type PipelinePayload = {
  pipeline: {
    purchaseOrders: Record<string, number>;
    stockOrders: Record<string, number>;
    manufacturingOrders: Record<string, number>;
    shipping: Record<string, number>;
  };
  verifiedCounts: Record<string, number>;
  outstandingBalances: number;
};

type ShippingPayload = {
  byPartner: Record<string, number>;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  ddpSharePct: number;
  avgLeadTimeDays: number;
};

function collectStatuses(...groups: Record<string, number>[]): string[] {
  const set = new Set<string>();
  for (const g of groups) for (const k of Object.keys(g)) set.add(k);
  return [...set].sort();
}

export function DashboardView() {
  const params = useSearchParams();
  const query = params.toString();

  const overview = useQuery({
    queryKey: ["dashboard", "overview", query],
    queryFn: async () => (await api.get<OverviewPayload>(`/api/analytics/overview${query ? `?${query}` : ""}`)).data,
  });
  const channelMix = useQuery({
    queryKey: ["dashboard", "channel-mix", query],
    queryFn: async () =>
      (await api.get<BreakdownPayload>(`/api/analytics/revenue/breakdown${query ? `?${query}&` : "?"}by=channel`)).data,
  });
  const pipeline = useQuery({
    queryKey: ["dashboard", "pipeline"],
    queryFn: async () => (await api.get<PipelinePayload>("/api/analytics/manufacturing/pipeline")).data,
  });
  const shipping = useQuery({
    queryKey: ["dashboard", "shipping", query],
    queryFn: async () => (await api.get<ShippingPayload>(`/api/analytics/shipping${query ? `?${query}` : ""}`)).data,
  });

  const trend = overview.data?.trend ?? [];
  const topProducts = overview.data?.topProducts ?? [];
  const channelRows = channelMix.data?.rows ?? [];
  const pipelineData = pipeline.data?.pipeline;
  const shippingData = shipping.data;

  const statuses = pipelineData
    ? collectStatuses(pipelineData.purchaseOrders, pipelineData.stockOrders, pipelineData.manufacturingOrders)
    : [];

  const stackedSeries = pipelineData
    ? [
        {
          label: "Distributor POs",
          data: statuses.map((s) => pipelineData.purchaseOrders[s] ?? 0),
          color: CHART_COLORS.primary,
        },
        {
          label: "Stock orders",
          data: statuses.map((s) => pipelineData.stockOrders[s] ?? 0),
          color: CHART_COLORS.secondary,
        },
        {
          label: "Manufacturing orders",
          data: statuses.map((s) => pipelineData.manufacturingOrders[s] ?? 0),
          color: CHART_COLORS.purple,
        },
      ]
    : [];

  const partnerEntries = Object.entries(shippingData?.byPartner ?? {});

  const quickLinks = [
    { href: "/analytics", title: "All analytics", description: "Full reports across revenue, products, pipeline, and data quality." },
    { href: "/purchase-orders-overview", title: "Purchase orders", description: "Distributor orders by channel and logistics status." },
    { href: "/stock-orders", title: "Stock orders", description: "Internal replenishment pipeline." },
    { href: "/manufacturing-orders", title: "Manufacturing", description: "Factories, invoices, shipments, and allocations." },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Package className="size-8 text-primary" />
            Operations dashboard
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Revenue, profit, and operational pipeline at a glance. Adjust the date range to update every chart below.
          </p>
        </div>
      </div>

      <AnalyticsHeader title="Key metrics" subtitle="Closed distributor PO revenue & pipeline volumes." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {overview.isPending
          ? Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="h-28 animate-pulse rounded-xl border bg-muted/20" />
            ))
          : (overview.data?.kpis ?? []).map((kpi) => (
              <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} deltaPct={kpi.deltaPct} />
            ))}
      </div>

      <ChartCard title="Revenue, cost, and profit trend">
        <LineChart
          labels={trend.map((p) => p.bucket)}
          series={[
            { label: "Revenue", data: trend.map((p) => p.revenue), color: CHART_COLORS.primary, fill: true },
            { label: "Cost", data: trend.map((p) => p.cost), color: CHART_COLORS.warning },
            { label: "Profit", data: trend.map((p) => p.profit), color: CHART_COLORS.success, fill: true },
          ]}
          currency
          className="h-[320px]"
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard title="Top products by profit">
            <BarChart
              labels={topProducts.map((r) => r.label)}
              series={[
                { label: "Profit", data: topProducts.map((r) => r.profit), color: CHART_COLORS.success },
                { label: "Revenue", data: topProducts.map((r) => r.revenue), color: CHART_COLORS.primary },
              ]}
              horizontal
              currency
              className="h-[320px]"
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard title="Revenue mix by channel">
            <DoughnutChart
              labels={channelRows.map((r) => r.label)}
              values={channelRows.map((r) => r.revenue)}
              currency
              className="h-[320px]"
            />
          </ChartCard>
        </div>
      </div>

      <ChartCard title="Order pipeline by status">
        <BarChart
          labels={statuses}
          series={stackedSeries}
          stacked
          className="h-[320px]"
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard title="Shipping spend by partner">
            <BarChart
              labels={partnerEntries.map(([k]) => k)}
              series={[
                { label: "Spend", data: partnerEntries.map(([, v]) => v), color: CHART_COLORS.indigo },
              ]}
              horizontal
              currency
              className="h-[280px]"
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard title="Shipments by status">
            <DoughnutChart
              labels={Object.keys(shippingData?.byStatus ?? {})}
              values={Object.values(shippingData?.byStatus ?? {})}
              className="h-[280px]"
            />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href} className="block transition-opacity hover:opacity-90">
            <Card className="h-full border-border/80 bg-card/40 hover:bg-card/60">
              <CardHeader>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
