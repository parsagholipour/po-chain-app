"use client";

import { useQuery } from "@tanstack/react-query";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { CHART_COLORS } from "@/components/analytics/charts/chart-setup";
import { IssueTable } from "@/components/analytics/issue-table";
import { api } from "@/lib/axios";
import type { QualityIssueRow } from "@/lib/types/analytics";

type Payload = {
  missingCatalogPricing: QualityIssueRow[];
  missingLinePricing: QualityIssueRow[];
  unverifiedAllocations: QualityIssueRow[];
  missingEtaPivots: QualityIssueRow[];
  staleTransitDistributorOrders: QualityIssueRow[];
  unverifiedProducts: QualityIssueRow[];
};

export function DataQualityView() {
  const dataQuery = useQuery({
    queryKey: ["analytics", "data-quality"],
    queryFn: async () => (await api.get<Payload>("/api/analytics/data-quality")).data,
  });
  const data = dataQuery.data;

  const summary = [
    { label: "Catalog missing price/cost", value: data?.missingCatalogPricing.length ?? 0 },
    { label: "PO lines missing price/cost", value: data?.missingLinePricing.length ?? 0 },
    { label: "Unverified MO allocations", value: data?.unverifiedAllocations.length ?? 0 },
    { label: "MO pivots missing ETA", value: data?.missingEtaPivots.length ?? 0 },
    { label: "Stale in-transit POs", value: data?.staleTransitDistributorOrders.length ?? 0 },
    { label: "Unverified products", value: data?.unverifiedProducts.length ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <AnalyticsHeader
        title="Data quality analytics"
        subtitle="Operational integrity checks that impact reporting reliability."
      />

      <ChartCard title="Issue count summary (capped at 100 per category)">
        <BarChart
          labels={summary.map((s) => s.label)}
          series={[{ label: "Open issues", data: summary.map((s) => s.value), color: CHART_COLORS.danger }]}
          horizontal
          className="h-[320px]"
        />
      </ChartCard>

      <ChartCard title="Products missing cost/price">
        <IssueTable rows={data?.missingCatalogPricing ?? []} />
      </ChartCard>
      <ChartCard title="PO lines missing unit cost/price">
        <IssueTable rows={data?.missingLinePricing ?? []} />
      </ChartCard>
      <ChartCard title="Unverified line allocations">
        <IssueTable rows={data?.unverifiedAllocations ?? []} />
      </ChartCard>
      <ChartCard title="MO pivots missing estimated completion date">
        <IssueTable rows={data?.missingEtaPivots ?? []} />
      </ChartCard>
      <ChartCard title="Distributor POs stuck in transit for >14 days">
        <IssueTable rows={data?.staleTransitDistributorOrders ?? []} />
      </ChartCard>
      <ChartCard title="Products not verified">
        <IssueTable rows={data?.unverifiedProducts ?? []} />
      </ChartCard>
    </div>
  );
}
