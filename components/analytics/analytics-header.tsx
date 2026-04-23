"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import { DateRangePicker } from "@/components/analytics/date-range-picker";
import { parseAnalyticsRange } from "@/lib/analytics/date-range";
import type { AnalyticsGranularity } from "@/lib/types/analytics";

export function AnalyticsHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const range = parseAnalyticsRange(new URLSearchParams(params.toString()));

  function update(next: { from?: string; to?: string; granularity?: AnalyticsGranularity }) {
    const current = new URLSearchParams(params.toString());
    if (next.from) current.set("from", next.from);
    if (next.to) current.set("to", next.to);
    if (next.granularity) current.set("granularity", next.granularity);
    router.replace(`?${current.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <DateRangePicker
        from={range.from}
        to={range.to}
        granularity={range.granularity}
        onFromChange={(value) => update({ from: value })}
        onToChange={(value) => update({ to: value })}
        onGranularityChange={(value) => update({ granularity: value })}
      />
    </div>
  );
}
