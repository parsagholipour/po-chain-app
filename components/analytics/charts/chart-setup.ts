"use client";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { DEFAULT_THEME_PRIMARY_COLOR } from "@/lib/store-theme";

let registered = false;

export function registerChartJs() {
  if (registered) return;
  ChartJS.register(
    ArcElement,
    BarElement,
    CategoryScale,
    Filler,
    Legend,
    LinearScale,
    LineElement,
    PointElement,
    Tooltip,
  );

  ChartJS.defaults.font.family =
    "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ChartJS.defaults.font.size = 12;
  ChartJS.defaults.color = "rgb(107 114 128)";
  ChartJS.defaults.borderColor = "rgba(148, 163, 184, 0.25)";
  ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
  ChartJS.defaults.plugins.legend.labels.boxWidth = 8;
  ChartJS.defaults.plugins.legend.labels.boxHeight = 8;
  ChartJS.defaults.plugins.legend.labels.padding = 12;
  ChartJS.defaults.plugins.tooltip.backgroundColor = "rgba(15, 23, 42, 0.92)";
  ChartJS.defaults.plugins.tooltip.padding = 10;
  ChartJS.defaults.plugins.tooltip.titleFont = { weight: "bold", size: 12 };
  ChartJS.defaults.plugins.tooltip.cornerRadius = 8;
  ChartJS.defaults.elements.line.tension = 0.35;
  ChartJS.defaults.elements.line.borderWidth = 2;
  ChartJS.defaults.elements.point.radius = 0;
  ChartJS.defaults.elements.point.hoverRadius = 4;
  ChartJS.defaults.elements.arc.borderWidth = 0;

  registered = true;
}

export const CHART_COLORS = {
  primary: DEFAULT_THEME_PRIMARY_COLOR,
  secondary: "#0ea5e9",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  purple: "#a855f7",
  pink: "#ec4899",
  indigo: "#6366f1",
  amber: "#d97706",
  gray: "#64748b",
} as const;

export const CHART_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.purple,
  CHART_COLORS.warning,
  CHART_COLORS.pink,
  CHART_COLORS.success,
  CHART_COLORS.indigo,
  CHART_COLORS.danger,
  CHART_COLORS.amber,
  CHART_COLORS.gray,
];

export function withAlpha(color: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  const [r, g, b] = parseChartColor(color) ?? [110, 46, 143];
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

function parseChartColor(color: string): [number, number, number] | null {
  const trimmed = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hex) {
    const raw = hex[1];
    const expanded =
      raw.length === 3
        ? raw
            .split("")
            .map((char) => `${char}${char}`)
            .join("")
        : raw;
    return [
      parseInt(expanded.slice(0, 2), 16),
      parseInt(expanded.slice(2, 4), 16),
      parseInt(expanded.slice(4, 6), 16),
    ];
  }

  const rgb = /^rgb\((.*)\)$/i.exec(trimmed);
  if (!rgb) return null;

  const parts = rgb[1].includes(",")
    ? rgb[1].split(",").map((part) => part.trim())
    : rgb[1].trim().split(/\s+/);
  if (parts.length !== 3) return null;

  const channels = parts.map((part) => {
    if (!/^\d+$/.test(part)) return null;
    const parsed = Number(part);
    return parsed >= 0 && parsed <= 255 ? parsed : null;
  });

  if (channels.some((channel) => channel == null)) return null;

  return channels as [number, number, number];
}
