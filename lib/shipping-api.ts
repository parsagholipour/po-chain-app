import type { Prisma } from "@/app/generated/prisma/client";
import { shippingOrderTypeFromPurchaseOrderType } from "@/lib/shipping";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";
import { orderStatusLogFromPrisma } from "@/lib/order-status-log";
import {
  purchaseOrderDetailInclude,
  purchaseOrderLineApiInclude,
  purchaseOrderOsdListInclude,
} from "@/lib/purchase-order-include";
import { shippingDetailInclude } from "@/lib/shipping-include";
import { warehouseOrderDetailInclude } from "@/lib/warehouse-order-include";

export type ShippingWithRelations = Prisma.ShippingGetPayload<{
  include: typeof shippingDetailInclude;
}>;

export type PurchaseOrderDetailWithRelations = Prisma.PurchaseOrderGetPayload<{
  include: typeof purchaseOrderDetailInclude;
}>;

export type PurchaseOrderOsdDetailPayload = Prisma.PurchaseOrderOsdGetPayload<{
  include: typeof purchaseOrderOsdListInclude;
}>;

export type PurchaseOrderLineApiPayload = Prisma.PurchaseOrderLineGetPayload<{
  include: typeof purchaseOrderLineApiInclude;
}>;

export type ManufacturingOrderDetailWithRelations = Prisma.ManufacturingOrderGetPayload<{
  include: typeof manufacturingOrderDetailInclude;
}>;

export type WarehouseOrderDetailWithRelations = Prisma.WarehouseOrderGetPayload<{
  include: typeof warehouseOrderDetailInclude;
}>;

type ShippingLike = {
  id: string;
  type: "manufacturing_order" | "purchase_order" | "stock_order" | "warehouse_order";
  status: string;
  cost: { toNumber(): number } | number | string | null;
  deliveryDutiesPaid: boolean;
  trackingNumber: string;
  shippedAt: Date | null;
  trackingLink: string | null;
  notes: string | null;
  invoiceDocumentKey: string | null;
  logisticsPartnerId: string | null;
  saleChannelLocationId: string | null;
  shipToLocationName: string | null;
  shipToRecipientName: string | null;
  shipToCompanyName: string | null;
  shipToPhoneNumber: string | null;
  shipToEmail: string | null;
  shipToAddressLine1: string | null;
  shipToAddressLine2: string | null;
  shipToCity: string | null;
  shipToStateProvince: string | null;
  shipToPostalCode: string | null;
  shipToCountry: string | null;
  shipToNotes: string | null;
  statusLogs?: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    note: string | null;
    purchaseOrderId: string | null;
    manufacturingOrderId: string | null;
    warehouseOrderId: string | null;
    shippingId: string | null;
    storeId: string;
    createdAt: Date;
    createdById: string;
    createdBy: {
      id: string;
      name: string | null;
      email: string;
      realEmail: string | null;
      realName: string | null;
    };
  }>;
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
  saleChannelLocation?: SaleChannelLocationLike;
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
  warehouseOrderShippings?: Array<{
    warehouseOrder: {
      id: string;
      number: number;
      name: string;
      status: string;
    };
  }>;
};

type MoneyLike = { toNumber(): number } | number | string | null | undefined;

type SaleChannelLocationLike = {
  id: string;
  name: string;
  recipientName: string;
  companyName: string | null;
  phoneNumber: string | null;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string | null;
  postalCode: string | null;
  country: string;
  shippingNotes: string | null;
  saleChannelId: string;
} | null;

function saleChannelLocationRefFromPrisma(location: SaleChannelLocationLike) {
  if (!location) return null;
  return {
    id: location.id,
    name: location.name,
    recipientName: location.recipientName,
    companyName: location.companyName,
    phoneNumber: location.phoneNumber,
    email: location.email,
    addressLine1: location.addressLine1,
    addressLine2: location.addressLine2,
    city: location.city,
    stateProvince: location.stateProvince,
    postalCode: location.postalCode,
    country: location.country,
    shippingNotes: location.shippingNotes,
    saleChannelId: location.saleChannelId,
  };
}

function moneyJsonValue(value: MoneyLike) {
  if (value == null) return null;
  const n =
    typeof value === "object" && "toNumber" in value
      ? value.toNumber()
      : Number(value);
  return Number.isFinite(n) ? n : null;
}

function productFromPrisma<
  T extends {
    cost: MoneyLike;
    price: MoneyLike;
    map: MoneyLike;
    msrp: MoneyLike;
  },
>(product: T) {
  return {
    ...product,
    cost: moneyJsonValue(product.cost),
    price: moneyJsonValue(product.price),
    map: moneyJsonValue(product.map),
    msrp: moneyJsonValue(product.msrp),
  };
}

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

  const warehouseOrders = (row.warehouseOrderShippings ?? []).map((item) => ({
    id: item.warehouseOrder.id,
    number: item.warehouseOrder.number,
    name: item.warehouseOrder.name,
    status: item.warehouseOrder.status,
    orderType: "warehouse_order" as const,
  }));

  const costJson = moneyJsonValue(row.cost);

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
    saleChannelLocationId: row.saleChannelLocationId ?? null,
    saleChannelLocation: saleChannelLocationRefFromPrisma(row.saleChannelLocation ?? null),
    shipToLocationName: row.shipToLocationName ?? null,
    shipToRecipientName: row.shipToRecipientName ?? null,
    shipToCompanyName: row.shipToCompanyName ?? null,
    shipToPhoneNumber: row.shipToPhoneNumber ?? null,
    shipToEmail: row.shipToEmail ?? null,
    shipToAddressLine1: row.shipToAddressLine1 ?? null,
    shipToAddressLine2: row.shipToAddressLine2 ?? null,
    shipToCity: row.shipToCity ?? null,
    shipToStateProvince: row.shipToStateProvince ?? null,
    shipToPostalCode: row.shipToPostalCode ?? null,
    shipToCountry: row.shipToCountry ?? null,
    shipToNotes: row.shipToNotes ?? null,
    statusLogs: (row.statusLogs ?? []).map(orderStatusLogFromPrisma),
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
    orders: [...manufacturingOrders, ...purchaseOrders, ...warehouseOrders].sort(
      (a, b) => a.number - b.number,
    ),
  };
}

export function purchaseOrderLineFromPrisma(line: PurchaseOrderLineApiPayload) {
  const {
    manufacturingOrderLines,
    warehouseOrderLines,
    product,
    unitCost,
    unitPrice,
    ...lineRest
  } = line;
  return {
    ...lineRest,
    unitCost: moneyJsonValue(unitCost),
    unitPrice: moneyJsonValue(unitPrice),
    product: productFromPrisma(product),
    allocations: manufacturingOrderLines.map((mol) => ({
      manufacturingOrderId: mol.manufacturingOrderId,
      manufacturerId: mol.manufacturerId,
      quantity: mol.quantity,
      manufacturingOrder: mol.manufacturingOrder,
      manufacturer: mol.manufacturer,
    })),
    warehouseAllocations: warehouseOrderLines.map((wol) => ({
      warehouseOrderId: wol.warehouseOrderId,
      quantity: wol.quantity,
      warehouseOrder: wol.warehouseOrder,
    })),
  };
}

function mapPurchaseOrderOsd(osd: PurchaseOrderOsdDetailPayload) {
  return {
    id: osd.id,
    purchaseOrderId: osd.purchaseOrderId,
    type: osd.type,
    resolution: osd.resolution,
    manufacturingOrderId: osd.manufacturingOrderId,
    manufacturingOrder: osd.manufacturingOrder,
    documentKey: osd.documentKey,
    notes: osd.notes,
    storeId: osd.storeId,
    createdAt: osd.createdAt.toISOString(),
    updatedAt: osd.updatedAt.toISOString(),
    createdById: osd.createdById,
    lines: osd.lines.map((ol) => ({
      id: ol.id,
      osdId: ol.osdId,
      quantity: ol.quantity,
      purchaseOrderLineId: ol.purchaseOrderLineId,
      storeId: ol.storeId,
      createdAt: ol.createdAt.toISOString(),
      purchaseOrderLine: {
        ...ol.purchaseOrderLine,
        unitCost: moneyJsonValue(ol.purchaseOrderLine.unitCost),
        unitPrice: moneyJsonValue(ol.purchaseOrderLine.unitPrice),
        product: productFromPrisma(ol.purchaseOrderLine.product),
      },
    })),
  };
}

export function purchaseOrderOsdFromPrisma(osd: PurchaseOrderOsdDetailPayload) {
  return mapPurchaseOrderOsd(osd);
}

export function purchaseOrderDetailFromPrisma(row: PurchaseOrderDetailWithRelations) {
  const {
    purchaseOrderShippings,
    lines,
    osds,
    invoice,
    saleChannelLocation,
    statusLogs,
    warehouseOrderPurchaseOrders,
    ...rest
  } = row;

  return {
    ...rest,
    invoice: invoice
      ? {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          documentKey: invoice.documentKey ?? null,
        }
      : null,
    saleChannelLocation: saleChannelLocationRefFromPrisma(saleChannelLocation),
    lines: lines.map((line) => purchaseOrderLineFromPrisma(line)),
    osds: osds.map(mapPurchaseOrderOsd),
    statusLogs: statusLogs.map(orderStatusLogFromPrisma),
    warehouseOrderPurchaseOrders,
    shippings: purchaseOrderShippings.map((item) => shippingRowFromPrisma(item.shipping)),
  };
}

export function manufacturingOrderDetailFromPrisma(
  row: ManufacturingOrderDetailWithRelations,
) {
  const { manufacturingOrderShippings, statusLogs, ...rest } = row;

  return {
    ...rest,
    statusLogs: statusLogs.map(orderStatusLogFromPrisma),
    shippings: manufacturingOrderShippings.map((item) => shippingRowFromPrisma(item.shipping)),
  };
}

export function warehouseOrderDetailFromPrisma(row: WarehouseOrderDetailWithRelations) {
  const { warehouseOrderShippings, statusLogs, ...rest } = row;

  return {
    ...rest,
    statusLogs: statusLogs.map(orderStatusLogFromPrisma),
    shippings: warehouseOrderShippings.map((item) => shippingRowFromPrisma(item.shipping)),
  };
}
