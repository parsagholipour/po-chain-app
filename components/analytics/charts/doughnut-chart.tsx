"use client";

import { Doughnut } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { cn } from "@/lib/utils";
import { CHART_PALETTE, registerChartJs, withAlpha } from "./chart-setup";

registerChartJs();

export function DoughnutChart({
  labels,
  values,
  className,
  currency = false,
  cutout = "64%",
}: {
  labels: string[];
  values: number[];
  className?: string;
  currency?: boolean;
  cutout?: string;
}) {
  const data: ChartData<"doughnut"> = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: labels.map((_, idx) => withAlpha(CHART_PALETTE[idx % CHART_PALETTE.length], 0.85)),
        borderColor: labels.map((_, idx) => CHART_PALETTE[idx % CHART_PALETTE.length]),
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  };

  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout,
    plugins: {
      legend: { position: "right" },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = Number(ctx.parsed ?? 0);
            const total = ctx.dataset.data.reduce((sum: number, v) => sum + Number(v ?? 0), 0);
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
            const formatted = currency
              ? value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
              : value.toLocaleString();
            return `${ctx.label}: ${formatted} (${pct}%)`;
          },
        },
      },
    },
  };

  return (
    <div className={cn("h-[260px] w-full", className)}>
      <Doughnut data={data} options={options} />
    </div>
  );
}
