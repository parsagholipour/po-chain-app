import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
  return (
    <Card size="sm" className="border-border/70 bg-card/50">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xl tabular-nums sm:text-2xl">
          <span className="break-words">{formatKpiValue(value, valueFormat)}</span>
          {deltaPct != null ? (
            <span
              className={cn(
                "text-sm font-medium",
                deltaPct > 0 && "text-emerald-600 dark:text-emerald-400",
                deltaPct < 0 && "text-destructive",
                deltaPct === 0 && "text-muted-foreground",
              )}
            >
              {`${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
