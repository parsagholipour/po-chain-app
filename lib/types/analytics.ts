export type AnalyticsGranularity = "day" | "week" | "month";

export type AnalyticsRange = {
  from: string;
  to: string;
  granularity: AnalyticsGranularity;
};

export type AnalyticsKpiValueFormat = "currency" | "percent" | "integer" | "number";

export type AnalyticsKpi = {
  label: string;
  value: number;
  deltaPct: number | null;
  /** How to render `value` in KPI tiles (defaults to `"number"`). */
  valueFormat?: AnalyticsKpiValueFormat;
};

export type TimeSeriesPoint = {
  bucket: string;
  revenue: number;
  cost: number;
  profit: number;
  units: number;
};

export type BreakdownRow = {
  id: string;
  label: string;
  revenue: number;
  cost: number;
  profit: number;
  units: number;
  marginPct: number;
};

export type ProductLeaderboardRow = BreakdownRow & {
  sku: string;
};

export type QualityIssueRow = {
  id: string;
  label: string;
  note: string;
};

export type InflowOutflowRow = {
  id: string;
  label: string;
  inflowUnits: number;
  outflowUnits: number;
  netUnits: number;
};
