"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { ChartCard } from "@/components/analytics/chart-card";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { DoughnutChart } from "@/components/analytics/charts/doughnut-chart";
import { CHART_COLORS } from "@/components/analytics/charts/chart-setup";
import { api } from "@/lib/axios";
import type { BreakdownRow } from "@/lib/types/analytics";

type Payload = { rows: BreakdownRow[] };

export function SaleChannelsView() {
  const params = useSearchParams();
  const query = params.toString();
  const dataQuery = useQuery({
    queryKey: ["analytics", "sale-channels", query],
    queryFn: async () => (await api.get<Payload>(`/api/analytics/sale-channels${query ? `?${query}` : ""}`)).data,
  });

  const rows = dataQuery.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <AnalyticsHeader
        title="Sale channels analytics"
        subtitle="Revenue and profitability by channel for closed distributor POs."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard title="Revenue and profit by channel">
            <BarChart
              labels={rows.map((r) => r.label)}
              series={[
                { label: "Revenue", data: rows.map((r) => r.revenue), color: CHART_COLORS.primary },
                { label: "Profit", data: rows.map((r) => r.profit), color: CHART_COLORS.success },
              ]}
              currency
              className="h-[320px]"
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard title="Channel revenue mix">
            <DoughnutChart
              labels={rows.map((r) => r.label)}
              values={rows.map((r) => r.revenue)}
              currency
              className="h-[320px]"
            />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Units sold by channel">
          <BarChart
            labels={rows.map((r) => r.label)}
            series={[{ label: "Units", data: rows.map((r) => r.units), color: CHART_COLORS.secondary }]}
            className="h-[260px]"
          />
        </ChartCard>
        <ChartCard title="Margin % by channel">
          <BarChart
            labels={rows.map((r) => r.label)}
            series={[{ label: "Margin %", data: rows.map((r) => r.marginPct), color: CHART_COLORS.purple }]}
            className="h-[260px]"
          />
        </ChartCard>
      </div>

      <ChartCard title="Channel performance">
        <BreakdownTable rows={rows} />
      </ChartCard>
    </div>
  );
}
