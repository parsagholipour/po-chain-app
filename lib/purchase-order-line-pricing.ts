import type { Prisma, SaleChannelType } from "@/app/generated/prisma/client";
import { centsToMoney } from "@/lib/distributor-orders/money";
import { missingStorePriceMessage, storePriceCentsFromMsrp } from "@/lib/store-pricing";

type ProductPricingRow = {
  cost: unknown;
  price: unknown;
  /** Required when the line belongs to a store sale channel, which prices off MSRP. */
  msrp?: unknown;
  sku?: string | null;
  name?: string | null;
};

type ProductPricingOptions = {
  saleChannelType?: SaleChannelType | null;
};

/** Thrown when a store sale channel line has no MSRP to derive a store price from. */
export class MissingStorePriceError extends Error {
  constructor(product: { sku?: string | null; name?: string | null }) {
    super(missingStorePriceMessage(product));
    this.name = "MissingStorePriceError";
  }
}

/**
 * Snapshot product pricing onto a PO/SO line so reports stay stable
 * even if product catalog pricing changes later.
 *
 * Store sale channels pay the store price (a share of MSRP) instead of the wholesale price;
 * without a usable MSRP there is no price to snapshot, so this throws instead of writing a
 * blank unit price. Callers must turn `MissingStorePriceError` into a 400.
 */
export function productPricingSnapshot(
  product: ProductPricingRow,
  { saleChannelType }: ProductPricingOptions = {},
): {
  unitCost: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal | string | null;
} {
  let unitPrice: Prisma.Decimal | string | null;
  if (saleChannelType === "store") {
    const storePriceCents = storePriceCentsFromMsrp(product.msrp);
    if (storePriceCents == null || storePriceCents <= 0) {
      throw new MissingStorePriceError(product);
    }
    unitPrice = centsToMoney(storePriceCents);
  } else {
    unitPrice = (product.price as Prisma.Decimal | null | undefined) ?? null;
  }

  return {
    unitCost: (product.cost as Prisma.Decimal | null | undefined) ?? null,
    unitPrice,
  };
}
