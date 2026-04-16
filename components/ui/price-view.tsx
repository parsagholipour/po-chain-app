import { cn } from "@/lib/utils";

function parseAmount(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export type PriceViewProps = {
  value: string | number | null | undefined;
  className?: string;
  /** Applied when there is no numeric value to show (default: em dash). */
  emptyClassName?: string;
};

/**
 * Read-only money display (two decimal places, locale-aware).
 */
export function PriceView({ value, className, emptyClassName }: PriceViewProps) {
  const n = parseAmount(value);
  if (n == null) {
    return <span className={cn("text-muted-foreground", emptyClassName, className)}>—</span>;
  }
  return (
    <span className={cn("tabular-nums", className)}>
      {n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}
