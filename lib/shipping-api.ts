import type { Prisma } from "@/app/generated/prisma/client";
import { shippingOrderTypeFromPurchaseOrderType } from "@/lib/shipping";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";
import { purchaseOrderDetailInclude } from "@/lib/purchase-order-include";
import { shippingDetailInclude } from "@/lib/shipping-include";

export type ShippingWithRelations = Prisma.ShippingGetPayload<{
  include: typeof shippingDetailInclude;
}>;

export type PurchaseOrderDetailWithRelations = Prisma.PurchaseOrderGetPayload<{
  include: typeof purchaseOrderDetailInclude;
}>;

export type ManufacturingOrderDetailWithRelations = Prisma.ManufacturingOrderGetPayload<{
  include: typeof manufacturingOrderDetailInclude;
}>;

type ShippingLike = {
  id: string;
  type: "manufacturing_order" | "purchase_order" | "stock_order";
  status: string;
  cost: { toNumber(): number } | number | string | null;
  deliveryDutiesPaid: boolean;
  trackingNumber: string;
  shippedAt: Date | null;
  trackingLink: string | null;
  notes: string | null;
  invoiceDocumentKey: string | null;
  logisticsPartnerId: string | null;
  logisticsPartner?: {
    id: string;
    name: string;
    logoKey: string | null;
    contactNumber: string | null;
    link: string | null;
    type: "freight_forwarder" | "carrier";
    createdAt: Date;
    updatedAt: Date;
  } | null;
  manufacturingOrderShippings?: Array<{
    manufacturingOrder: {
      id: string;
      number: number;
      name: string;
      status: string;
    };
  }>;
  purchaseOrderShippings?: Array<{
    purchaseOrder: {
      id: string;
      number: number;
      name: string;
      status: string;
      type: "distributor" | "stock";
    };
  }>;
};

export function shippingRowFromPrisma(row: ShippingLike) {
  const manufacturingOrders = (row.manufacturingOrderShippings ?? []).map((item) => ({
    id: item.manufacturingOrder.id,
    number: item.manufacturingOrder.number,
    name: item.manufacturingOrder.name,
    status: item.manufacturingOrder.status,
    orderType: "manufacturing_order" as const,
  }));

  const purchaseOrders = (row.purchaseOrderShippings ?? []).map((item) => ({
    id: item.purchaseOrder.id,
    number: item.purchaseOrder.number,
    name: item.purchaseOrder.name,
    status: item.purchaseOrder.status,
    orderType: shippingOrderTypeFromPurchaseOrderType(item.purchaseOrder.type),
  }));

  const costJson =
    row.cost == null
      ? null
      : typeof row.cost === "object" && row.cost !== null && "toNumber" in row.cost
        ? row.cost.toNumber()
        : Number(row.cost);

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    cost: Number.isFinite(costJson) ? costJson : null,
    deliveryDutiesPaid: row.deliveryDutiesPaid ?? false,
    trackingNumber: row.trackingNumber,
    shippedAt: row.shippedAt?.toISOString() ?? null,
    trackingLink: row.trackingLink ?? null,
    notes: row.notes ?? null,
    invoiceDocumentKey: row.invoiceDocumentKey ?? null,
    logisticsPartnerId: row.logisticsPartnerId ?? null,
    logisticsPartner: row.logisticsPartner
      ? {
          id: row.logisticsPartner.id,
          name: row.logisticsPartner.name,
          logoKey: row.logisticsPartner.logoKey ?? null,
          contactNumber: row.logisticsPartner.contactNumber ?? null,
          link: row.logisticsPartner.link ?? null,
          type: row.logisticsPartner.type,
          createdAt: row.logisticsPartner.createdAt.toISOString(),
          updatedAt: row.logisticsPartner.updatedAt.toISOString(),
        }
      : null,
    orders: [...manufacturingOrders, ...purchaseOrders].sort((a, b) => a.number - b.number),
  };
}

export function purchaseOrderDetailFromPrisma(row: PurchaseOrderDetailWithRelations) {
  const { purchaseOrderShippings, ...rest } = row;

  return {
    ...rest,
    shippings: purchaseOrderShippings.map((item) => shippingRowFromPrisma(item.shipping)),
  };
}

export function manufacturingOrderDetailFromPrisma(
  row: ManufacturingOrderDetailWithRelations,
) {
  const { manufacturingOrderShippings, ...rest } = row;

  return {
    ...rest,
    shippings: manufacturingOrderShippings.map((item) => shippingRowFromPrisma(item.shipping)),
  };
}
