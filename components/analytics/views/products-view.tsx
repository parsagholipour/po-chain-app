"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { ChartCard } from "@/components/analytics/chart-card";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { CHART_COLORS } from "@/components/analytics/charts/chart-setup";
import { api } from "@/lib/axios";
import type { ProductLeaderboardRow, QualityIssueRow } from "@/lib/types/analytics";
import { TablePagination } from "@/components/ui/table-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination } from "@/hooks/use-pagination";

type LeaderboardPayload = { rows: ProductLeaderboardRow[] };
type UnsoldPayload = { rows: QualityIssueRow[] };

export function ProductsView() {
  const params = useSearchParams();
  const query = params.toString();

  const leaderboard = useQuery({
    queryKey: ["analytics", "products", "leaderboard", query],
    queryFn: async () =>
      (await api.get<LeaderboardPayload>(`/api/analytics/products/leaderboard${query ? `?${query}` : ""}`)).data,
  });

  const lowMargin = useQuery({
    queryKey: ["analytics", "products", "low-margin", query],
    queryFn: async () =>
      (await api.get<LeaderboardPayload>(`/api/analytics/products/low-margin${query ? `?${query}` : ""}`)).data,
  });

  const unsold = useQuery({
    queryKey: ["analytics", "products", "unsold", query],
    queryFn: async () =>
      (await api.get<UnsoldPayload>(`/api/analytics/products/unsold${query ? `?${query}` : ""}`)).data,
  });

  const topRows = (leaderboard.data?.rows ?? []).slice(0, 10);
  const lowRows = (lowMargin.data?.rows ?? []).slice(0, 10);
  const unsoldRows = unsold.data?.rows ?? [];
  const unsoldPagination = usePagination({ totalItems: unsoldRows.length, resetDeps: [query] });
  const pagedUnsoldRows = unsoldPagination.sliceItems(unsoldRows);

  return (
    <div className="space-y-6">
      <AnalyticsHeader
        title="Products analytics"
        subtitle="SKU-level profitability, low-margin products, and unsold catalog coverage."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top 10 products by profit">
          <BarChart
            labels={topRows.map((r) => r.label)}
            series={[
              { label: "Profit", data: topRows.map((r) => r.profit), color: CHART_COLORS.success },
              { label: "Revenue", data: topRows.map((r) => r.revenue), color: CHART_COLORS.primary },
            ]}
            horizontal
            currency
            className="h-[360px]"
          />
        </ChartCard>
        <ChartCard title="Top 10 products by units sold">
          <BarChart
            labels={topRows.map((r) => r.label)}
            series={[{ label: "Units", data: topRows.map((r) => r.units), color: CHART_COLORS.secondary }]}
            horizontal
            className="h-[360px]"
          />
        </ChartCard>
      </div>

      <ChartCard title="Top products leaderboard">
        <BreakdownTable rows={leaderboard.data?.rows ?? []} />
      </ChartCard>

      <ChartCard title="Lowest margin products">
        <BarChart
          labels={lowRows.map((r) => r.label)}
          series={[{ label: "Margin %", data: lowRows.map((r) => r.marginPct), color: CHART_COLORS.danger }]}
          horizontal
          className="h-[320px]"
        />
      </ChartCard>

      <ChartCard title="Low-margin products details">
        <BreakdownTable rows={lowMargin.data?.rows ?? []} />
      </ChartCard>

      <ChartCard title="Unsold products in selected range">
        <div className="overflow-hidden rounded-lg border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unsoldRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="h-20 text-center text-muted-foreground">
                    No unsold products for this period.
                  </TableCell>
                </TableRow>
              ) : (
                pagedUnsoldRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="text-muted-foreground">{row.note}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="border-t border-border/60 px-3 py-2">
            <TablePagination
              {...unsoldPagination}
              onPageChange={unsoldPagination.setPage}
              onPageSizeChange={unsoldPagination.setPageSize}
            />
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
