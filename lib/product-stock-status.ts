export const productStockStatusValues = ["in_stock", "out_of_stock", "unknown"] as const;

export type ProductStockStatus = (typeof productStockStatusValues)[number];

export const productStockStatusLabels: Record<ProductStockStatus, string> = {
  in_stock: "In stock",
  out_of_stock: "Out of stock",
  unknown: "Unknown",
};

/**
 * Availability derived from the stock count. Store sale channels never receive the count itself,
 * so stock status has to be resolved server-side and sent alongside it.
 */
export function productStockStatus(
  stockCount: number | null | undefined,
): ProductStockStatus {
  if (stockCount == null) return "unknown";
  return stockCount > 0 ? "in_stock" : "out_of_stock";
}
