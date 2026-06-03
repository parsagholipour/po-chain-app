export const productEditingStatusValues = [
  "standard",
  "final_stock",
  "one_print_only",
  "discontinued",
] as const;

export type ProductEditingStatus = (typeof productEditingStatusValues)[number];

export const productEditingStatusLabels: Record<ProductEditingStatus, string> = {
  standard: "Standard",
  final_stock: "Final Stock",
  one_print_only: "One Print Only",
  discontinued: "Discontinued",
};
