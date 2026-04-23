"use client";

import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { formatUsd } from "@/lib/format-usd";
import { cn } from "@/lib/utils";
import { CHART_PALETTE, registerChartJs, withAlpha } from "./chart-setup";

registerChartJs();

export type LineSeries = {
  label: string;
  data: number[];
  color?: string;
  fill?: boolean;
};

export function LineChart({
  labels,
  series,
  className,
  currency = false,
  stacked = false,
}: {
  labels: string[];
  series: LineSeries[];
  className?: string;
  currency?: boolean;
  stacked?: boolean;
}) {
  const data: ChartData<"line"> = {
    labels,
    datasets: series.map((s, idx) => {
      const color = s.color ?? CHART_PALETTE[idx % CHART_PALETTE.length];
      return {
        label: s.label,
        data: s.data,
        borderColor: color,
        backgroundColor: s.fill ? withAlpha(color, 0.18) : withAlpha(color, 0.9),
        pointBackgroundColor: color,
        fill: s.fill ?? false,
      };
    }),
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "bottom" },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = Number(ctx.parsed.y ?? 0);
            const formatted = currency
              ? formatUsd(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
              : value.toLocaleString();
            return `${ctx.dataset.label}: ${formatted}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked,
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkipPadding: 16 },
      },
      y: {
        stacked,
        beginAtZero: true,
        ticks: {
          callback: (value) =>
            currency
              ? formatUsd(Number(value), { minimumFractionDigits: 0, maximumFractionDigits: 0 })
              : Number(value).toLocaleString(),
        },
      },
    },
  };

  return (
    <div className={cn("h-[320px] w-full", className)}>
      <Line data={data} options={options} />
    </div>
  );
}
