/** Distributor / PO lifecycle (purchase order). */
export const distributorPoStatusLabels: Record<string, string> = {
  open: "Open",
  in_transit: "Shipped",
  invoiced: "Invoiced",
  closed: "Closed",
};

export const distributorPoStatuses = ["open", "in_transit", "invoiced", "closed"] as const;

export const shippingStatusLabels: Record<string, string> = {
  pending: "Pending",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const shippingStatuses = [
  "pending",
  "in_transit",
  "delivered",
  "cancelled",
] as const;

/** Manufacturing order workflow (former PO order status). */
export const moStatusLabels: Record<string, string> = {
  open: "Open",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  invoiced: "Invoiced",
  paid: "Paid",
  closed: "Closed",
  initial: "Initial",
  deposit_paid: "Deposit paid",
  manufacturing: "Manufacturing",
  balance_paid: "Balance paid",
  ready_to_pickup: "Ready to pickup",
  picked_up: "Picked up",
};

export const moStatuses = [
  "open",
  "ready_to_ship",
  "shipped",
  "invoiced",
  "paid",
  "closed",
] as const;

export const moManufacturerStatuses = [
  "initial",
  "deposit_paid",
  "manufacturing",
  "balance_paid",
  "ready_to_pickup",
  "picked_up",
] as const;

/** @deprecated Use distributorPoStatusLabels for PO; moStatusLabels for MO */
export const poStatusLabels = { ...distributorPoStatusLabels, ...moStatusLabels };

/** @deprecated Use distributorPoStatuses for PO header */
export const poStatuses = distributorPoStatuses;

/** @deprecated Use moManufacturerStatuses */
export const poManufacturerStatuses = moManufacturerStatuses;
