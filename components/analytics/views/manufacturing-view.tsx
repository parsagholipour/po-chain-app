"use client";

import { useQuery } from "@tanstack/react-query";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { DoughnutChart } from "@/components/analytics/charts/doughnut-chart";
import { CHART_COLORS } from "@/components/analytics/charts/chart-setup";
import { api } from "@/lib/axios";

type Payload = {
  pipeline: {
    manufacturingOrders: Record<string, number>;
  };
  manufacturerFunnel: Record<string, number>;
  outstandingBalances: number;
  verifiedCounts: Record<string, number>;
};

export function ManufacturingView() {
  const dataQuery = useQuery({
    queryKey: ["analytics", "manufacturing", "pipeline"],
    queryFn: async () => (await api.get<Payload>("/api/analytics/manufacturing/pipeline")).data,
  });
  const data = dataQuery.data;

  const moStatus = Object.entries(data?.pipeline.manufacturingOrders ?? {});
  const funnel = Object.entries(data?.manufacturerFunnel ?? {});
  const verified = Object.entries(data?.verifiedCounts ?? {});

  return (
    <div className="space-y-6">
      <AnalyticsHeader
        title="Manufacturing analytics"
        subtitle="MO status pipeline, pivot funnel, and allocation verification health."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard title="Manufacturing orders by status">
            <BarChart
              labels={moStatus.map(([status]) => status)}
              series={[
                { label: "Orders", data: moStatus.map(([, count]) => count), color: CHART_COLORS.primary },
              ]}
              className="h-[300px]"
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard title="MO status share">
            <DoughnutChart
              labels={moStatus.map(([status]) => status)}
              values={moStatus.map(([, count]) => count)}
              className="h-[300px]"
            />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard title="Manufacturer pivot status funnel">
            <BarChart
              labels={funnel.map(([status]) => status)}
              series={[
                { label: "Pivots", data: funnel.map(([, count]) => count), color: CHART_COLORS.purple },
              ]}
              className="h-[300px]"
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard title="Verified vs unverified allocations">
            <DoughnutChart
              labels={verified.map(([k]) => k)}
              values={verified.map(([, v]) => v)}
              className="h-[300px]"
            />
          </ChartCard>
        </div>
      </div>

      <ChartCard title="Outstanding balances (MOs with deposit paid, balance pending)">
        <p className="text-3xl font-semibold tabular-nums">
          {(data?.outstandingBalances ?? 0).toLocaleString()}
        </p>
      </ChartCard>
    </div>
  );
}
