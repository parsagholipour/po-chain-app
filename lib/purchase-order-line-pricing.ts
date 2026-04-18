import type { Prisma } from "@/app/generated/prisma/client";

type ProductPricingRow = {
  cost: unknown;
  price: unknown;
};

/**
 * Snapshot product pricing onto a PO/SO line so reports stay stable
 * even if product catalog pricing changes later.
 */
export function productPricingSnapshot(product: ProductPricingRow): {
  unitCost: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal | null;
} {
  return {
    unitCost: (product.cost as Prisma.Decimal | null | undefined) ?? null,
    unitPrice: (product.price as Prisma.Decimal | null | undefined) ?? null,
  };
}
