import { randomUUID } from "node:crypto";

export function distributorOrderInvoiceNumber(date = new Date()) {
  const ymd = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `DO-${ymd}-${randomUUID().slice(0, 8).toUpperCase()}`;
}
