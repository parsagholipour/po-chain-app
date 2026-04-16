"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { ChartCard } from "@/components/analytics/chart-card";
import { LineChart } from "@/components/analytics/charts/line-chart";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { DoughnutChart } from "@/components/analytics/charts/doughnut-chart";
import { CHART_COLORS } from "@/components/analytics/charts/chart-setup";
import { api } from "@/lib/axios";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BreakdownRow, TimeSeriesPoint } from "@/lib/types/analytics";

type TrendPayload = { points: TimeSeriesPoint[] };
type BreakdownPayload = { rows: BreakdownRow[] };

export function RevenueView() {
  const params = useSearchParams();
  const router = useRouter();
  const query = params.toString();
  function onBreakdownChange(next: string) {
    const current = new URLSearchParams(params.toString());
    current.set("by", next);
    router.replace(`?${current.toString()}`);
  }

  const breakdownBy = params.get("by") ?? "channel";

  const trend = useQuery({
    queryKey: ["analytics", "revenue", "trend", query],
    queryFn: async () => (await api.get<TrendPayload>(`/api/analytics/revenue/trend${query ? `?${query}` : ""}`)).data,
  });

  const breakdown = useQuery({
    queryKey: ["analytics", "revenue", "breakdown", query, breakdownBy],
    queryFn: async () =>
      (
        await api.get<BreakdownPayload>(
          `/api/analytics/revenue/breakdown${query ? `?${query}&` : "?"}by=${breakdownBy}`,
        )
      ).data,
  });

  const points = trend.data?.points ?? [];
  const rows = breakdown.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <AnalyticsHeader title="Sales & profit" subtitle="Closed distributor PO profitability by time and segment." />

      <ChartCard title="Revenue, cost, profit over time">
        <LineChart
          labels={points.map((p) => p.bucket)}
          series={[
            { label: "Revenue", data: points.map((p) => p.revenue), color: CHART_COLORS.primary, fill: true },
            { label: "Cost", data: points.map((p) => p.cost), color: CHART_COLORS.warning, fill: true },
            { label: "Profit", data: points.map((p) => p.profit), color: CHART_COLORS.success, fill: true },
          ]}
          currency
          className="h-[340px]"
        />
      </ChartCard>

      <ChartCard title="Units sold over time">
        <BarChart
          labels={points.map((p) => p.bucket)}
          series={[{ label: "Units", data: points.map((p) => p.units), color: CHART_COLORS.secondary }]}
          className="h-[260px]"
        />
      </ChartCard>

      <ChartCard title="Breakdown">
        <Tabs value={breakdownBy} onValueChange={onBreakdownChange} className="mb-4">
          <TabsList variant="line">
            <TabsTrigger value="channel">By channel</TabsTrigger>
            <TabsTrigger value="category">By category</TabsTrigger>
            <TabsTrigger value="manufacturer">By manufacturer</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <BarChart
              labels={rows.slice(0, 12).map((r) => r.label)}
              series={[
                { label: "Revenue", data: rows.slice(0, 12).map((r) => r.revenue), color: CHART_COLORS.primary },
                { label: "Profit", data: rows.slice(0, 12).map((r) => r.profit), color: CHART_COLORS.success },
              ]}
              currency
              className="h-[320px]"
            />
          </div>
          <div className="lg:col-span-2">
            <DoughnutChart
              labels={rows.slice(0, 8).map((r) => r.label)}
              values={rows.slice(0, 8).map((r) => r.revenue)}
              currency
              className="h-[320px]"
            />
          </div>
        </div>
        <div className="mt-6">
          <BreakdownTable rows={rows} />
        </div>
      </ChartCard>
    </div>
  );
}
