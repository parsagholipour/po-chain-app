import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  deltaPct,
}: {
  label: string;
  value: number;
  deltaPct: number | null;
}) {
  const deltaLabel =
    deltaPct == null ? "n/a vs previous period" : `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}% vs previous period`;

  return (
    <Card size="sm" className="border-border/70 bg-card/50">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{deltaLabel}</p>
      </CardContent>
    </Card>
  );
}
