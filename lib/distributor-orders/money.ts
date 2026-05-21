export const DEFAULT_PAYMENT_CURRENCY = "usd";

export function moneyToCents(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

export function centsToMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function normalizeCurrency(value: string | undefined | null): string {
  const currency = value?.trim().toLowerCase();
  return currency || DEFAULT_PAYMENT_CURRENCY;
}
