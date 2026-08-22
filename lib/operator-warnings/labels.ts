import type {
  OperatorWarningStatus,
  OperatorWarningTier,
  OperatorWarningType,
} from "@/lib/types/api";

export const OPERATOR_WARNING_TYPES = [
  "product_missing_sku",
  "product_missing_wholesale",
  "product_missing_cost",
  "product_unverified",
  "po_line_missing_cost",
  "po_line_missing_price",
  "mo_line_missing_cost",
  "mo_allocation_unverified",
  "mo_missing_eta",
  "mo_missing_invoice",
  "po_stale_in_transit",
] as const satisfies readonly OperatorWarningType[];

export const OPERATOR_WARNING_TIERS = [
  "low",
  "medium",
  "high",
  "critical",
] as const satisfies readonly OperatorWarningTier[];

export const OPERATOR_WARNING_TYPE_LABELS: Record<OperatorWarningType, string> = {
  product_missing_sku: "Missing SKU",
  product_missing_wholesale: "Missing wholesale price",
  product_missing_cost: "Missing cost",
  product_unverified: "Unverified product",
  po_line_missing_price: "PO line missing price",
  po_line_missing_cost: "PO line missing cost",
  mo_line_missing_cost: "MO line missing cost",
  mo_allocation_unverified: "Unverified MO allocation",
  mo_missing_eta: "MO missing ETA",
  mo_missing_invoice: "MO missing manufacturer invoice",
  po_stale_in_transit: "Stale in-transit PO",
};

export const OPERATOR_WARNING_TIER_LABELS: Record<OperatorWarningTier, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const OPERATOR_WARNING_STATUS_LABELS: Record<OperatorWarningStatus, string> = {
  open: "Open",
  disregarded: "Disregarded",
};
