import type { OperatorWarningTier, OperatorWarningType } from "@/app/generated/prisma/client";

export type WarningFinding = {
  type: OperatorWarningType;
  tier: OperatorWarningTier;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  href: string | null;
};

export function warningFingerprint(type: OperatorWarningType, entityType: string, entityId: string) {
  return `${type}:${entityType}:${entityId}`;
}

export function parseCompositeEntityId(entityId: string) {
  const separator = entityId.indexOf(":");
  if (separator <= 0 || separator === entityId.length - 1) return null;
  return {
    left: entityId.slice(0, separator),
    right: entityId.slice(separator + 1),
  };
}

export function productHref(productId: string) {
  return `/products?id=${productId}`;
}

export function purchaseOrderHref(type: "distributor" | "stock", purchaseOrderId: string) {
  return type === "stock" ? `/stock-orders/${purchaseOrderId}` : `/purchase-orders/${purchaseOrderId}`;
}

export function manufacturingOrderHref(manufacturingOrderId: string) {
  return `/manufacturing-orders/${manufacturingOrderId}`;
}

export function skuLabel(sku: string) {
  const trimmed = sku.trim();
  return trimmed.length > 0 ? trimmed : "no SKU";
}
