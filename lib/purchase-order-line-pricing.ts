type ProductPricing = {
  cost: unknown;
  price: unknown;
};

/**
 * Snapshot product pricing onto a PO/SO line so reports stay stable
 * even if product catalog pricing changes later.
 */
export function productPricingSnapshot(product: ProductPricing) {
  return {
    unitCost: product.cost ?? null,
    unitPrice: product.price ?? null,
  };
}
