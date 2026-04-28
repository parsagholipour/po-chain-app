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

export const statusBadgeClassNames: Record<string, string> = {
  open: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/15 dark:text-slate-200",
  initial: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/15 dark:text-slate-200",
  pending: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
  manufacturing: "border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-200",
  ready_to_ship: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
  ready_to_pickup: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
  in_transit: "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200",
  shipped: "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200",
  deposit_paid: "border-cyan-200 bg-cyan-100 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/15 dark:text-cyan-200",
  invoiced: "border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200",
  balance_paid: "border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200",
  paid: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
  delivered: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
  picked_up: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
  closed: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200",
  cancelled: "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200",
};

export function statusBadgeClassName(status: string) {
  return statusBadgeClassNames[status] ?? "border-border bg-muted text-muted-foreground";
}

/** @deprecated Use distributorPoStatusLabels for PO; moStatusLabels for MO */
export const poStatusLabels = { ...distributorPoStatusLabels, ...moStatusLabels };

/** @deprecated Use distributorPoStatuses for PO header */
export const poStatuses = distributorPoStatuses;

/** @deprecated Use moManufacturerStatuses */
export const poManufacturerStatuses = moManufacturerStatuses;
