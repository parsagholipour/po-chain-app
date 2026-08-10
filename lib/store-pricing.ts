import { centsToMoney, moneyToCents } from "@/lib/distributor-orders/money";

/**
 * Store sale channels (the accounts that sign in through a magic link) do not pay the
 * wholesale price. Their price is derived from MSRP instead.
 */
export const STORE_PRICE_MSRP_RATE = 0.5;

export const WHOLESALE_PRICE_LABEL = "Wholesale Price";
export const STORE_PRICE_LABEL = "Store Price";
export const WHOLESALE_PRICE_SHORT_LABEL = "Wholesale";
export const STORE_PRICE_SHORT_LABEL = "Store";

export type MoneyLike = string | number | null | undefined;

export function storePriceCentsFromMsrp(msrp: unknown): number | null {
  const msrpCents = moneyToCents(msrp);
  if (msrpCents == null) return null;
  return Math.round(msrpCents * STORE_PRICE_MSRP_RATE);
}

export function storePriceFromMsrp(msrp: unknown): string | null {
  const cents = storePriceCentsFromMsrp(msrp);
  return cents == null ? null : centsToMoney(cents);
}

export function missingStorePriceMessage(product: {
  sku?: string | null;
  name?: string | null;
}) {
  const label = [product.sku, product.name].filter(Boolean).join(" - ");
  const subject = label ? `Product ${label}` : "This product";
  return `${subject} does not have a valid MSRP, so its store price cannot be calculated`;
}

/**
 * Unit price a sale channel account pays for a product: the store price when the account is a
 * store magic-link account, the wholesale price otherwise.
 */
export function saleChannelProductPrice(
  product: { storePrice: MoneyLike; wholesalePrice: MoneyLike } | null | undefined,
): MoneyLike {
  if (!product) return null;
  return product.storePrice ?? product.wholesalePrice;
}
