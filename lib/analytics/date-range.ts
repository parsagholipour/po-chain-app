import { z } from "zod";
import type { AnalyticsGranularity, AnalyticsRange } from "@/lib/types/analytics";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date");

export const analyticsRangeSchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  granularity: z.enum(["day", "week", "month"]).optional(),
});

export function parseAnalyticsRange(searchParams: URLSearchParams): AnalyticsRange {
  const parsed = analyticsRangeSchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    granularity: searchParams.get("granularity") ?? undefined,
  });

  const now = new Date();
  const defaultTo = isoDate(now);
  const defaultFrom = isoDate(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
  const from = parsed.success && parsed.data.from ? parsed.data.from : defaultFrom;
  const to = parsed.success && parsed.data.to ? parsed.data.to : defaultTo;
  const granularity: AnalyticsGranularity =
    parsed.success && parsed.data.granularity
      ? parsed.data.granularity
      : autoGranularity(from, to);

  return { from, to, granularity };
}

export function toStartOfDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function toEndOfDay(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

export function previousPeriod(range: AnalyticsRange): AnalyticsRange {
  const fromDate = toStartOfDay(range.from);
  const toDate = toEndOfDay(range.to);
  const lengthMs = toDate.getTime() - fromDate.getTime() + 1;
  const prevTo = new Date(fromDate.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - lengthMs + 1);

  return {
    from: isoDate(prevFrom),
    to: isoDate(prevTo),
    granularity: range.granularity,
  };
}

function autoGranularity(from: string, to: string): AnalyticsGranularity {
  const days = Math.max(
    1,
    Math.ceil((toEndOfDay(to).getTime() - toStartOfDay(from).getTime()) / (24 * 60 * 60 * 1000)),
  );
  if (days <= 62) return "day";
  if (days <= 366) return "week";
  return "month";
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
