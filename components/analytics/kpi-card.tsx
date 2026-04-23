import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/format-usd";
import type { AnalyticsKpiValueFormat } from "@/lib/types/analytics";

function formatKpiValue(value: number, valueFormat: AnalyticsKpiValueFormat | undefined) {
  switch (valueFormat ?? "number") {
    case "currency":
      return formatUsd(value, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    case "percent":
      return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case "integer":
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    default:
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

export function KpiCard({
  label,
  value,
  deltaPct,
  valueFormat,
}: {
  label: string;
  value: number;
  deltaPct: number | null;
  valueFormat?: AnalyticsKpiValueFormat;
}) {
  const deltaLabel =
    deltaPct == null ? "n/a vs previous period" : `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}% vs previous period`;

  return (
    <Card size="sm" className="border-border/70 bg-card/50">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{formatKpiValue(value, valueFormat)}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{deltaLabel}</p>
      </CardContent>
    </Card>
  );
}
