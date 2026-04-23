export type GlobalSearchScope =
  | "po"
  | "mo"
  | "so"
  | "manufacturer"
  | "product"
  | "shipping"
  | "sale_channel";

export const GLOBAL_SEARCH_SCOPES: readonly {
  scope: GlobalSearchScope;
  label: string;
}[] = [
  { scope: "po", label: "PO" },
  { scope: "mo", label: "MO" },
  { scope: "so", label: "SO" },
  { scope: "manufacturer", label: "Manufacturer" },
  { scope: "product", label: "Product" },
  { scope: "shipping", label: "Shipping" },
  { scope: "sale_channel", label: "Sales channels" },
] as const;

export function scopeLabel(scope: GlobalSearchScope | null): string {
  if (!scope) return "All";
  const row = GLOBAL_SEARCH_SCOPES.find((s) => s.scope === scope);
  return row?.label ?? scope;
}
