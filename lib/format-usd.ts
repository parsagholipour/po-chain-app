export type FormatUsdOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

/** Locale-aware USD string (e.g. `$1,234.56`). */
export function formatUsd(value: number, options?: FormatUsdOptions): string {
  const maximumFractionDigits = options?.maximumFractionDigits ?? 2;
  const minimumFractionDigits = options?.minimumFractionDigits ?? maximumFractionDigits;
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits,
  });
}
