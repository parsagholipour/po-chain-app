"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { KpiCard } from "@/components/analytics/kpi-card";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { LineChart } from "@/components/analytics/charts/line-chart";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { DoughnutChart } from "@/components/analytics/charts/doughnut-chart";
import { CHART_COLORS } from "@/components/analytics/charts/chart-setup";
import { api } from "@/lib/axios";
import type { AnalyticsKpi, BreakdownRow, ProductLeaderboardRow, TimeSeriesPoint } from "@/lib/types/analytics";

type OverviewPayload = {
  kpis: AnalyticsKpi[];
  trend: TimeSeriesPoint[];
  topProducts: ProductLeaderboardRow[];
};

type BreakdownPayload = { rows: BreakdownRow[] };

export function OverviewView() {
  const params = useSearchParams();
  const query = params.toString();
  const overview = useQuery({
    queryKey: ["analytics", "overview", query],
    queryFn: async () => (await api.get<OverviewPayload>(`/api/analytics/overview${query ? `?${query}` : ""}`)).data,
  });
  const channelMix = useQuery({
    queryKey: ["analytics", "revenue", "breakdown", "channel", query],
    queryFn: async () =>
      (await api.get<BreakdownPayload>(`/api/analytics/revenue/breakdown${query ? `?${query}&` : "?"}by=channel`)).data,
  });

  const trend = overview.data?.trend ?? [];
  const topProducts = overview.data?.topProducts ?? [];
  const channelRows = channelMix.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <AnalyticsHeader
        title="Analytics overview"
        subtitle="Executive summary across revenue, margin, and operational pipeline."
      />

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
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard title="Top products by profit">
            <BarChart
              labels={topProducts.map((row) => row.label)}
              series={[
                { label: "Profit", data: topProducts.map((row) => row.profit), color: CHART_COLORS.success },
                { label: "Revenue", data: topProducts.map((row) => row.revenue), color: CHART_COLORS.primary },
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

      <ChartCard title="Top products leaderboard">
        <BreakdownTable rows={topProducts} emptyMessage="No closed distributor PO lines in range." />
      </ChartCard>
    </div>
  );
}
