"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { DoughnutChart } from "@/components/analytics/charts/doughnut-chart";
import { CHART_COLORS } from "@/components/analytics/charts/chart-setup";
import { KpiCard } from "@/components/analytics/kpi-card";
import { api } from "@/lib/axios";

type Payload = {
  byPartner: Record<string, number>;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  ddpSharePct: number;
  avgLeadTimeDays: number;
};

export function ShippingView() {
  const params = useSearchParams();
  const query = params.toString();
  const dataQuery = useQuery({
    queryKey: ["analytics", "shipping", query],
    queryFn: async () => (await api.get<Payload>(`/api/analytics/shipping${query ? `?${query}` : ""}`)).data,
  });
  const data = dataQuery.data;

  const partner = Object.entries(data?.byPartner ?? {});
  const type = Object.entries(data?.byType ?? {});
  const status = Object.entries(data?.byStatus ?? {});

  const totalSpend = partner.reduce((sum, [, v]) => sum + v, 0);
  const totalShipments = status.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div className="space-y-6">
      <AnalyticsHeader
        title="Shipping analytics"
        subtitle="Spend, statuses, DDP share, and logistics timing across shipments."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total shipping spend" value={totalSpend} deltaPct={null} valueFormat="currency" />
        <KpiCard label="Total shipments" value={totalShipments} deltaPct={null} valueFormat="integer" />
        <KpiCard label="DDP share %" value={data?.ddpSharePct ?? 0} deltaPct={null} valueFormat="percent" />
        <KpiCard label="Avg lead time (days)" value={data?.avgLeadTimeDays ?? 0} deltaPct={null} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard title="Spend by logistics partner">
            <BarChart
              labels={partner.map(([k]) => k)}
              series={[{ label: "Spend", data: partner.map(([, v]) => v), color: CHART_COLORS.primary }]}
              horizontal
              currency
              className="h-[300px]"
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard title="Partner share">
            <DoughnutChart
              labels={partner.map(([k]) => k)}
              values={partner.map(([, v]) => v)}
              currency
              className="h-[300px]"
            />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spend by shipment type">
          <BarChart
            labels={type.map(([k]) => k)}
            series={[{ label: "Spend", data: type.map(([, v]) => v), color: CHART_COLORS.purple }]}
            currency
            className="h-[260px]"
          />
        </ChartCard>
        <ChartCard title="Shipments by status">
          <BarChart
            labels={status.map(([k]) => k)}
            series={[{ label: "Shipments", data: status.map(([, v]) => v), color: CHART_COLORS.secondary }]}
            className="h-[260px]"
          />
        </ChartCard>
      </div>
    </div>
  );
}
