/** API response shapes used across the PO app */

export type Manufacturer = {
  id: string;
  name: string;
  logoKey: string | null;
  region: string;
  createdAt: string;
  updatedAt: string;
};

export type SaleChannel = {
  id: string;
  name: string;
  logoKey: string | null;
  type: "distributor" | "amazon" | "cjdropshipping";
  createdAt: string;
};

export type LogisticsPartner = {
  id: string;
  name: string;
  logoKey: string | null;
  contactNumber: string | null;
  link: string | null;
  type: "freight_forwarder" | "carrier";
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  imageKey: string | null;
  barcodeKey: string | null;
  packagingKey: string | null;
  defaultManufacturerId: string;
  verified: boolean;
  defaultManufacturer: Manufacturer;
};

export type PurchaseOrderSummaryManufacturer = {
  manufacturerId: string;
  name: string;
  status: string;
};

export type ShippingStatusBadge = {
  id: string;
  status: string;
  type: "manufacturing_order" | "purchase_order" | "stock_order";
  trackingNumber: string;
};

export type PurchaseOrderSummary = {
  id: string;
  number: number;
  name: string;
  status: string;
  createdAt: string;
  manufacturers: PurchaseOrderSummaryManufacturer[];
  shippingBadges: ShippingStatusBadge[];
};

export type LinkedManufacturingOrderRef = {
  id: string;
  number: number;
  name: string;
  status: string;
};

export type PoLineRow = {
  id: string;
  quantity: number;
  product: Product;
};

export type ShippingOrderRef = {
  id: string;
  number: number;
  name: string;
  status: string;
  orderType: "manufacturing_order" | "purchase_order" | "stock_order";
};

export type ShippingRow = {
  id: string;
  type: "manufacturing_order" | "purchase_order" | "stock_order";
  status: string;
  trackingNumber: string;
  shippedAt: string | null;
  trackingLink: string | null;
  notes: string | null;
  invoiceDocumentKey: string | null;
  logisticsPartnerId: string | null;
  logisticsPartner: LogisticsPartner | null;
  orders: ShippingOrderRef[];
};

export type PoShippingRow = ShippingRow;

type PurchaseOrderDetailBase = {
  id: string;
  number: number;
  name: string;
  status: string;
  documentKey: string | null;
  lines: PoLineRow[];
  manufacturingOrderPurchaseOrders: {
    manufacturingOrder: LinkedManufacturingOrderRef;
  }[];
  shippings: ShippingRow[];
};

export type PurchaseOrderDetail =
  | (PurchaseOrderDetailBase & {
      type: "distributor";
      saleChannelId: string;
      saleChannel: { id: string; name: string; type: string; logoKey: string | null };
    })
  | (PurchaseOrderDetailBase & {
      type: "stock";
      saleChannelId: string | null;
      saleChannel: { id: string; name: string; type: string; logoKey: string | null } | null;
    });

/** Manufacturer pivot on a manufacturing order (invoices / production status). */
export type MoManufacturerPivot = {
  manufacturingOrderId: string;
  manufacturerId: string;
  status: string;
  invoiceId: string | null;
  manufacturer: { id: string; name: string; region: string };
  invoice: null | {
    id: string;
    invoiceNumber: string;
    documentKey: string | null;
    orderDate: string | null;
    estimatedCompletionDate: string | null;
    depositPaidAt: string | null;
    balancePaidAt: string | null;
  };

  depositPaidAt: string | null;
  depositPaidAmount: string | number | null;
  depositTrackingNumber: string | null;
  depositDocumentKey: string | null;

  manufacturingStartedAt: string | null;

  balancePaidAt: string | null;
  balancePaidAmount: string | number | null;
  balanceTrackingNumber: string | null;
  balanceDocumentKey: string | null;

  readyAt: string | null;
  pickedUpAt: string | null;
};

export type ManufacturingOrderSummaryManufacturer = {
  manufacturerId: string;
  name: string;
  status: string;
};

export type ManufacturingOrderSummary = {
  id: string;
  number: number;
  name: string;
  status: string;
  createdAt: string;
  manufacturers: ManufacturingOrderSummaryManufacturer[];
  shippingBadges: ShippingStatusBadge[];
};

export type MoLineAllocationRow = {
  manufacturingOrderId: string;
  purchaseOrderLineId: string;
  verified: boolean;
  manufacturerId: string;
  manufacturer: { id: string; name: string; region: string };
  purchaseOrderLine: {
    id: string;
    quantity: number;
    product: Product;
    purchaseOrder: { id: string; number: number; name: string; type: "distributor" | "stock" };
  };
};

export type ManufacturingOrderDetail = {
  id: string;
  number: number;
  name: string;
  status: string;
  documentKey: string | null;
  createdAt: string;
  updatedAt: string;
  manufacturers: MoManufacturerPivot[];
  purchaseOrders: {
    purchaseOrderId: string;
    purchaseOrder: {
      id: string;
      number: number;
      name: string;
      status: string;
      type: "distributor" | "stock";
      saleChannel: { id: string; name: string; type: string; logoKey: string | null } | null;
    };
  }[];
  lineAllocations: MoLineAllocationRow[];
  shippings: ShippingRow[];
};
