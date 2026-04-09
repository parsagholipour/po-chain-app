/** Distributor / PO lifecycle (purchase order). */
export const distributorPoStatusLabels: Record<string, string> = {
  open: "Open",
  in_transit: "In transit",
  closed: "Closed",
};

export const distributorPoStatuses = ["open", "in_transit", "closed"] as const;

/** Manufacturing order workflow (former PO order status). */
export const moStatusLabels: Record<string, string> = {
  open: "Open",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  in_transit: "In transit",
  delivered: "Delivered",
  invoiced: "Invoiced",
  paid: "Paid",
  closed: "Closed",
  initial: "Initial",
  deposit_paid: "Deposit paid",
  manufacturing: "Manufacturing",
  balance_paid: "Balance paid",
  ready_to_pickup: "Ready to pickup",
};

export const moStatuses = [
  "open",
  "ready_to_ship",
  "shipped",
  "in_transit",
  "delivered",
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
] as const;

/** @deprecated Use distributorPoStatusLabels for PO; moStatusLabels for MO */
export const poStatusLabels = { ...distributorPoStatusLabels, ...moStatusLabels };

/** @deprecated Use distributorPoStatuses for PO header */
export const poStatuses = distributorPoStatuses;

/** @deprecated Use moManufacturerStatuses */
export const poManufacturerStatuses = moManufacturerStatuses;
