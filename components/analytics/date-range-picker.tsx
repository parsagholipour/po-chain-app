"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AnalyticsGranularity } from "@/lib/types/analytics";

export function DateRangePicker({
  from,
  to,
  granularity,
  onFromChange,
  onToChange,
  onGranularityChange,
}: {
  from: string;
  to: string;
  granularity: AnalyticsGranularity;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onGranularityChange: (value: AnalyticsGranularity) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="analytics-from">From</Label>
        <Input id="analytics-from" type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="analytics-to">To</Label>
        <Input id="analytics-to" type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Granularity</Label>
        <Select value={granularity} onValueChange={(v) => onGranularityChange(v as AnalyticsGranularity)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Granularity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Daily</SelectItem>
            <SelectItem value="week">Weekly</SelectItem>
            <SelectItem value="month">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
