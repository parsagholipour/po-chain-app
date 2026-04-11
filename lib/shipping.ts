export const shippingTypeLabels = {
  manufacturing_order: "Manufacturing Order",
  purchase_order: "Purchase Order",
  stock_order: "Stock Order",
} as const;

export type ShippingType = keyof typeof shippingTypeLabels;

export const logisticsPartnerTypeLabels = {
  freight_forwarder: "Freight Forwarder",
  carrier: "Carrier",
} as const;

export type LogisticsPartnerType = keyof typeof logisticsPartnerTypeLabels;

export function logisticsPartnerTypeForShippingType(
  type: ShippingType,
): LogisticsPartnerType {
  return type === "manufacturing_order" ? "freight_forwarder" : "carrier";
}

export function shippingOrderTypeFromPurchaseOrderType(type: "distributor" | "stock") {
  return type === "stock" ? "stock_order" : "purchase_order";
}

export function shippingOrderHref(order: {
  id: string;
  orderType: ShippingType;
}) {
  switch (order.orderType) {
    case "manufacturing_order":
      return `/manufacturing-orders/${order.id}`;
    case "purchase_order":
      return `/purchase-orders/${order.id}`;
    case "stock_order":
      return `/stock-orders/${order.id}`;
  }
}
