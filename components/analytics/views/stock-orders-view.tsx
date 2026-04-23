"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AnalyticsHeader } from "@/components/analytics/analytics-header";
import { ChartCard } from "@/components/analytics/chart-card";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { DoughnutChart } from "@/components/analytics/charts/doughnut-chart";
import { CHART_COLORS } from "@/components/analytics/charts/chart-setup";
import { api } from "@/lib/axios";
import type { InflowOutflowRow } from "@/lib/types/analytics";
import { TablePagination } from "@/components/ui/table-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination } from "@/hooks/use-pagination";

type Payload = {
  inflowOutflow: InflowOutflowRow[];
  statusCounts: Record<string, number>;
};

export function StockOrdersView() {
  const params = useSearchParams();
  const query = params.toString();
  const dataQuery = useQuery({
    queryKey: ["analytics", "stock-orders", query],
    queryFn: async () => (await api.get<Payload>(`/api/analytics/stock-orders${query ? `?${query}` : ""}`)).data,
  });

  const statusEntries = Object.entries(dataQuery.data?.statusCounts ?? {});
  const inflowOutflowRows = dataQuery.data?.inflowOutflow ?? [];
  const flow = inflowOutflowRows.slice(0, 15);
  const pagination = usePagination({ totalItems: inflowOutflowRows.length, resetDeps: [query] });
  const pagedRows = pagination.sliceItems(inflowOutflowRows);

  return (
    <div className="space-y-6">
      <AnalyticsHeader
        title="Stock orders analytics"
        subtitle="Inbound stock pipeline and product-level inflow versus distributor outflow."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartCard title="Stock orders by status">
            <BarChart
              labels={statusEntries.map(([status]) => status)}
              series={[{ label: "Orders", data: statusEntries.map(([, v]) => v), color: CHART_COLORS.secondary }]}
              className="h-[280px]"
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard title="Status share">
            <DoughnutChart
              labels={statusEntries.map(([s]) => s)}
              values={statusEntries.map(([, v]) => v)}
              className="h-[280px]"
            />
          </ChartCard>
        </div>
      </div>

      <ChartCard title="Inflow (stock) vs outflow (distributor) by product">
        <BarChart
          labels={flow.map((r) => r.label)}
          series={[
            { label: "Inflow units", data: flow.map((r) => r.inflowUnits), color: CHART_COLORS.success },
            { label: "Outflow units", data: flow.map((r) => r.outflowUnits), color: CHART_COLORS.danger },
          ]}
          horizontal
          className="h-[420px]"
        />
      </ChartCard>

      <ChartCard title="Net stock movement (inflow minus outflow)">
        <div className="overflow-hidden rounded-lg border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Inflow</TableHead>
                <TableHead className="text-right">Outflow</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inflowOutflowRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                    No stock movement in this range.
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.inflowUnits.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.outflowUnits.toLocaleString()}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${row.netUnits < 0 ? "text-destructive" : "text-foreground"}`}
                    >
                      {row.netUnits > 0 ? "+" : ""}
                      {row.netUnits.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
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
