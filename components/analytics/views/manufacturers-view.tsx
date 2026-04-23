"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { DoughnutChart } from "@/components/analytics/charts/doughnut-chart";
import { CHART_COLORS } from "@/components/analytics/charts/chart-setup";
import { api } from "@/lib/axios";
import { TablePagination } from "@/components/ui/table-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PriceView } from "@/components/ui/price-view";
import { usePagination } from "@/hooks/use-pagination";

type Row = {
  id: string;
  label: string;
  revenue: number;
  cost: number;
  profit: number;
  units: number;
  marginPct: number;
  manufacturingSpend: number;
  openMoCount: number;
  avgLeadDays: number;
};

export function ManufacturersView() {
  const params = useSearchParams();
  const query = params.toString();
  const dataQuery = useQuery({
    queryKey: ["analytics", "manufacturers", query],
    queryFn: async () => (await api.get<{ rows: Row[] }>(`/api/analytics/manufacturers${query ? `?${query}` : ""}`)).data,
  });

  const rows = dataQuery.data?.rows ?? [];
  const pagination = usePagination({ totalItems: rows.length, resetDeps: [query] });
  const pagedRows = pagination.sliceItems(rows);
  const topRevenue = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const topSpend = [...rows].sort((a, b) => b.manufacturingSpend - a.manufacturingSpend).slice(0, 10);
  const openMoRows = rows.filter((r) => r.openMoCount > 0);

  return (
    <div className="space-y-6">
      <AnalyticsHeader
        title="Manufacturers analytics"
        subtitle="Revenue attribution, spend, open workload, and lead times by manufacturer."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue & profit by manufacturer (top 10)">
          <BarChart
            labels={topRevenue.map((r) => r.label)}
            series={[
              { label: "Revenue", data: topRevenue.map((r) => r.revenue), color: CHART_COLORS.primary },
              { label: "Profit", data: topRevenue.map((r) => r.profit), color: CHART_COLORS.success },
            ]}
            horizontal
            currency
            className="h-[340px]"
          />
        </ChartCard>
        <ChartCard title="Manufacturing spend (top 10)">
          <BarChart
            labels={topSpend.map((r) => r.label)}
            series={[
              { label: "Spend", data: topSpend.map((r) => r.manufacturingSpend), color: CHART_COLORS.warning },
            ]}
            horizontal
            currency
            className="h-[340px]"
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Open manufacturing orders by manufacturer">
          <DoughnutChart
            labels={openMoRows.map((r) => r.label)}
            values={openMoRows.map((r) => r.openMoCount)}
            className="h-[300px]"
          />
        </ChartCard>
        <ChartCard title="Average lead time (days) by manufacturer">
          <BarChart
            labels={rows.filter((r) => r.avgLeadDays > 0).map((r) => r.label)}
            series={[
              {
                label: "Avg lead days",
                data: rows.filter((r) => r.avgLeadDays > 0).map((r) => Number(r.avgLeadDays.toFixed(1))),
                color: CHART_COLORS.purple,
              },
            ]}
            className="h-[300px]"
          />
        </ChartCard>
      </div>

      <ChartCard title="Manufacturer performance">
        <div className="overflow-hidden rounded-lg border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Manufacturer</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Manufacturing spend</TableHead>
                <TableHead className="text-right">Open MOs</TableHead>
                <TableHead className="text-right">Avg lead days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right">
                    <PriceView value={row.revenue} />
                  </TableCell>
                  <TableCell className="text-right">
                    <PriceView value={row.profit} />
                  </TableCell>
                  <TableCell className="text-right">
                    <PriceView value={row.manufacturingSpend} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.openMoCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.avgLeadDays.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t border-border/60 px-3 py-2">
            <TablePagination
              {...pagination}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
