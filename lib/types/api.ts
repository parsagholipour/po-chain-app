/** API response shapes used across the PO app */

export type CustomFieldCondition = {
  id: string;
  definitionId: string;
  sourceField: string;
  operator:
    | "equals"
    | "not_equals"
    | "greater_than"
    | "less_than"
    | "greater_than_or_equal"
    | "less_than_or_equal"
    | "contains"
    | "not_empty"
    | "is_empty";
  value: string;
};

export type CustomFieldDefinition = {
  id: string;
  name: string;
  fieldKey: string;
  type: "text" | "number" | "date" | "boolean" | "file" | "image";
  entityType: string;
  required: boolean;
  sortOrder: number;
  conditionLogic: "and" | "or";
  conditions: CustomFieldCondition[];
  createdAt: string;
  updatedAt: string;
};

export type CustomFieldValue = {
  id: string;
  definitionId: string;
  entityId: string;
  textValue: string | null;
  numberValue: string | number | null;
  dateValue: string | null;
  booleanValue: boolean | null;
  fileKey: string | null;
};

export type CustomFieldValuesResponse = {
  definitions: CustomFieldDefinition[];
  values: CustomFieldValue[];
};

export type ProductCategory = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Manufacturer = {
  id: string;
  name: string;
  logoKey: string | null;
  region: string;
  contactNumber: string | null;
  address: string | null;
  email: string | null;
  link: string | null;
  notes: string | null;
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
  cost: string | number | null;
  price: string | number | null;
  imageKey: string | null;
  barcodeKey: string | null;
  packagingKey: string | null;
  defaultManufacturerId: string;
  categoryId: string | null;
  verified: boolean;
  defaultManufacturer: Manufacturer;
  category: ProductCategory | null;
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

export type PurchaseOrderSummaryManufacturingOrder = {
  id: string;
  number: number;
  name: string;
  status: string;
};

export type PurchaseOrderSummary = {
  id: string;
  number: number;
  name: string;
  status: string;
  createdAt: string;
  saleChannel: { id: string; name: string; type: string; logoKey: string | null } | null;
  manufacturers: PurchaseOrderSummaryManufacturer[];
  manufacturingOrders: PurchaseOrderSummaryManufacturingOrder[];
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
  unitCost: string | number | null;
  unitPrice: string | number | null;
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
  cost: string | number | null;
  deliveryDutiesPaid: boolean;
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
  };

  depositPaidAt: string | null;
  depositPaidAmount: string | number | null;
  depositRefNumber: string | null;
  depositDocumentKey: string | null;

  manufacturingStartedAt: string | null;
  estimatedCompletionAt: string | null;

  balancePaidAt: string | null;
  balancePaidAmount: string | number | null;
  balanceRefNumber: string | null;
  balanceDocumentKey: string | null;

  readyAt: string | null;
  pickedUpAt: string | null;
};

export type ManufacturingOrderSummaryManufacturer = {
  manufacturerId: string;
  name: string;
  status: string;
};

/** Linked distributor PO or stock (SO) order on an MO list row. */
export type ManufacturingOrderSummaryLinkedOrder = {
  id: string;
  name: string;
  type: "distributor" | "stock";
  /** Primary sale channel on the order, if any. */
  saleChannelName: string | null;
};

export type ManufacturingOrderSummary = {
  id: string;
  number: number;
  name: string;
  status: string;
  createdAt: string;
  manufacturers: ManufacturingOrderSummaryManufacturer[];
  shippingBadges: ShippingStatusBadge[];
  /** Distinct sale channel names from linked purchase / stock orders. */
  linkedSaleChannels?: string[];
  /** Linked purchase and stock orders (deduped). */
  linkedOrders: ManufacturingOrderSummaryLinkedOrder[];
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
    unitCost: string | number | null;
    unitPrice: string | number | null;
    product: Product;
    purchaseOrder: {
      id: string;
      number: number;
      name: string;
      type: "distributor" | "stock";
      saleChannel: { name: string } | null;
    };
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
