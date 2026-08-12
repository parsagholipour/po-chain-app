/**
 * Pure SKU -> Shopify variant matching for store checkout.
 *
 * Deliberately free of prisma, `server-only` and network access so it can be unit tested
 * directly: this module decides how much money the buyer is charged, and which of our lines
 * become real Shopify variant lines versus custom lines.
 *
 * No branch fails checkout. A custom line always carries the exact unit price and the SKU
 * string, so a missing/ambiguous/archived/out-of-stock variant degrades to a correctly priced
 * line instead of dead-ending the buyer.
 */

export type CheckoutPlanLineItem = {
  name: string;
  sku: string | null;
  quantity: number;
  unitAmountCents: number;
};

export type ShopifyPlanVariant = {
  id: string;
  sku: string | null;
  inventoryQuantity: number | null;
  inventoryPolicy: string | null;
  tracked: boolean | null;
  productStatus: string | null;
};

export type ShopifyLinePlanReason =
  | "matched"
  | "no_sku"
  | "sku_not_found"
  | "ambiguous_sku"
  | "product_archived"
  | "inventory_deny";

export type ShopifyPlannedLine = {
  mode: "variant" | "custom";
  reason: ShopifyLinePlanReason;
  name: string;
  sku: string | null;
  quantity: number;
  unitAmountCents: number;
  variantId: string | null;
};

export type ShopifyLinePlan = {
  lines: ShopifyPlannedLine[];
  warnings: Array<{ sku: string | null; name: string; reason: ShopifyLinePlanReason }>;
  totalCents: number;
};

function normalizeSku(sku: string | null | undefined) {
  const trimmed = sku?.trim();
  return trimmed ? trimmed : null;
}

/**
 * `inventoryPolicy: "DENY"` on a tracked variant with insufficient stock renders as
 * "out of stock" on Shopify's checkout. The app deliberately supports back-orders, so those
 * lines become custom lines instead — the buyer can always pay.
 */
function blocksPurchase(variant: ShopifyPlanVariant, quantity: number) {
  if (variant.tracked !== true) return false;
  if ((variant.inventoryPolicy ?? "").toUpperCase() !== "DENY") return false;
  return (variant.inventoryQuantity ?? 0) < quantity;
}

export function planShopifyDraftOrderLines({
  lineItems,
  variantsBySku,
}: {
  lineItems: CheckoutPlanLineItem[];
  /** Exact trimmed SKU -> every variant Shopify reported for it (length > 1 means ambiguous). */
  variantsBySku: Map<string, ShopifyPlanVariant[]>;
}): ShopifyLinePlan {
  const lines: ShopifyPlannedLine[] = [];
  const warnings: ShopifyLinePlan["warnings"] = [];
  let totalCents = 0;

  for (const item of lineItems) {
    const sku = normalizeSku(item.sku);
    const matches = sku ? (variantsBySku.get(sku) ?? []) : [];

    let reason: ShopifyLinePlanReason;
    let variant: ShopifyPlanVariant | null = null;

    if (!sku) {
      reason = "no_sku";
    } else if (matches.length === 0) {
      reason = "sku_not_found";
    } else if (matches.length > 1) {
      reason = "ambiguous_sku";
    } else if ((matches[0].productStatus ?? "").toUpperCase() === "ARCHIVED") {
      reason = "product_archived";
    } else if (blocksPurchase(matches[0], item.quantity)) {
      reason = "inventory_deny";
    } else {
      reason = "matched";
      variant = matches[0];
    }

    const mode = reason === "matched" ? "variant" : "custom";
    if (mode === "custom") {
      warnings.push({ sku, name: item.name, reason });
    }

    lines.push({
      mode,
      reason,
      name: item.name,
      sku,
      quantity: item.quantity,
      unitAmountCents: item.unitAmountCents,
      variantId: variant?.id ?? null,
    });
    totalCents += item.unitAmountCents * item.quantity;
  }

  return { lines, warnings, totalCents };
}
