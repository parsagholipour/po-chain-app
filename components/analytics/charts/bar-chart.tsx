"use client";

import { Bar } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { cn } from "@/lib/utils";
import { CHART_PALETTE, registerChartJs, withAlpha } from "./chart-setup";

registerChartJs();

export type BarSeries = {
  label: string;
  data: number[];
  color?: string;
};

export function BarChart({
  labels,
  series,
  className,
  currency = false,
  stacked = false,
  horizontal = false,
}: {
  labels: string[];
  series: BarSeries[];
  className?: string;
  currency?: boolean;
  stacked?: boolean;
  horizontal?: boolean;
}) {
  const colorsPerSeries = series.length === 1 && series[0].color == null;

  const data: ChartData<"bar"> = {
    labels,
    datasets: series.map((s, idx) => {
      const baseColor = s.color ?? CHART_PALETTE[idx % CHART_PALETTE.length];
      const backgroundColor = colorsPerSeries
        ? labels.map((_, li) => withAlpha(CHART_PALETTE[li % CHART_PALETTE.length], 0.85))
        : withAlpha(baseColor, 0.85);
      const borderColor = colorsPerSeries
        ? labels.map((_, li) => CHART_PALETTE[li % CHART_PALETTE.length])
        : baseColor;
      return {
        label: s.label,
        data: s.data,
        backgroundColor,
        borderColor,
        borderWidth: 0,
        borderRadius: 6,
        borderSkipped: false,
      };
    }),
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? "y" : "x",
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: series.length > 1, position: "bottom" },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = Number((horizontal ? ctx.parsed.x : ctx.parsed.y) ?? 0);
            const formatted = currency
              ? value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
              : value.toLocaleString();
            return `${ctx.dataset.label ?? ""}${ctx.dataset.label ? ": " : ""}${formatted}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked,
        grid: { display: horizontal },
        ticks: { autoSkipPadding: 14 },
      },
      y: {
        stacked,
        beginAtZero: true,
        grid: { display: !horizontal },
        ticks: {
          callback: (value) => {
            if (horizontal) return value as string;
            return currency
              ? `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : Number(value).toLocaleString();
          },
        },
      },
    },
  };

  return (
    <div className={cn("h-[320px] w-full", className)}>
      <Bar data={data} options={options} />
    </div>
  );
}
