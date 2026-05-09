/** API response shapes for JSON HTTP responses in this app. */

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

export type ProductType = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductCollection = {
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

export type Warehouse = {
  id: string;
  name: string;
  address: string | null;
  phoneNumber: string | null;
  email: string | null;
  saleChannelId: string | null;
  saleChannel: { id: string; name: string; type: string; logoKey: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

export type SaleChannel = {
  id: string;
  name: string;
  logoKey: string | null;
  type: "distributor" | "amazon" | "cjdropshipping";
  contactNumber: string | null;
  link: string | null;
  email: string | null;
  loginEnabled: boolean;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LogisticsPartner = {
  id: string;
  name: string;
  logoKey: string | null;
  contactNumber: string | null;
  link: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  type: "freight_forwarder" | "carrier";
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  upcGtin: string | null;
  cost: string | number | null;
  price: string | number | null;
  mop: number | null;
  map: string | number | null;
  msrp: string | number | null;
  quantityPerCarton: number | null;
  orderByDate: string | null;
  editingStatus: "standard" | "final_stock" | "one_print_only";
  description: string | null;
  imageLink: string;
  stockCount: number | null;
  imageKey: string | null;
  barcodeKey: string | null;
  packagingKey: string | null;
  defaultManufacturerId: string;
  categoryId: string | null;
  typeId: string | null;
  collectionId: string | null;
  verified: boolean;
  defaultManufacturer: Manufacturer;
  category: ProductCategory | null;
  type: ProductType | null;
  collection: ProductCollection | null;
};

export type PurchaseOrderSummaryManufacturer = {
  manufacturerId: string;
  name: string;
  status: string;
};

export type ShippingStatusBadge = {
  id: string;
  status: string;
  type: "manufacturing_order" | "purchase_order" | "stock_order" | "warehouse_order";
  trackingNumber: string;
};

export type PurchaseOrderSummaryManufacturingOrder = {
  id: string;
  number: number;
  name: string;
  status: string;
};

export type PurchaseOrderSummaryWarehouseOrder = {
  id: string;
  number: number;
  name: string;
  status: string;
  warehouseName: string;
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
  warehouseOrders: PurchaseOrderSummaryWarehouseOrder[];
  shippingBadges: ShippingStatusBadge[];
};

export type PurchaseOrderPdfLineImportItem = {
  sku: string;
  quantity: number;
};

export type PurchaseOrderPdfLineImportLine = PurchaseOrderPdfLineImportItem & {
  productId: string;
  productName: string;
};

export type PurchaseOrderPdfLineImportResponse = {
  extracted: PurchaseOrderPdfLineImportItem[];
  lines: PurchaseOrderPdfLineImportLine[];
  unmatched: PurchaseOrderPdfLineImportItem[];
};

export type LinkedManufacturingOrderRef = {
  id: string;
  number: number;
  name: string;
  status: string;
};

export type LinkedWarehouseOrderRef = {
  id: string;
  number: number;
  name: string;
  status: string;
  warehouse: { id: string; name: string };
};

export type PoLineAllocation = {
  manufacturingOrderId: string;
  manufacturerId: string;
  quantity: number;
  manufacturingOrder: { id: string; number: number; name: string };
  manufacturer: { id: string; name: string };
};

export type PoLineWarehouseAllocation = {
  warehouseOrderId: string;
  quantity: number;
  warehouseOrder: { id: string; number: number; name: string };
};

export type PoLineRow = {
  id: string;
  /** Effective quantity after OS&D (analytics / revenue). */
  quantity: number;
  /** Distributor-ordered quantity shown on the PO. */
  orderedQuantity: number;
  unitCost: string | number | null;
  unitPrice: string | number | null;
  product: Product;
  allocations: PoLineAllocation[];
  warehouseAllocations: PoLineWarehouseAllocation[];
};

export type PoOsdType = "overage" | "shortage" | "damage";
export type PoOsdResolution = "charged" | "returned" | "sent";

/** PO line shape embedded under an OS&D line (subset of `PoLineRow`). */
export type PoOsdNestedLine = {
  id: string;
  quantity: number;
  orderedQuantity: number;
  unitCost: string | number | null;
  unitPrice: string | number | null;
  product: Product;
};

export type PoOsdLineRow = {
  id: string;
  osdId: string;
  quantity: number;
  purchaseOrderLineId: string;
  storeId: string;
  createdAt: string;
  purchaseOrderLine: PoOsdNestedLine;
};

export type PoOsd = {
  id: string;
  purchaseOrderId: string;
  type: PoOsdType;
  resolution: PoOsdResolution;
  manufacturingOrderId: string | null;
  manufacturingOrder: { id: string; number: number; name: string } | null;
  documentKey: string | null;
  notes: string | null;
  storeId: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  lines: PoOsdLineRow[];
};

export type ShippingOrderRef = {
  id: string;
  number: number;
  name: string;
  status: string;
  orderType: "manufacturing_order" | "purchase_order" | "stock_order" | "warehouse_order";
};

export type ShippingRow = {
  id: string;
  type: "manufacturing_order" | "purchase_order" | "stock_order" | "warehouse_order";
  status: string;
  cost: string | number | null;
  deliveryDutiesPaid: boolean;
  trackingNumber: string;
  shippedAt: string | null;
  trackingLink: string | null;
  notes: string | null;
  invoiceDocumentKey: string | null;
  logisticsPartnerId: string | null;
  statusLogs: OrderStatusLog[];
  logisticsPartner: LogisticsPartner | null;
  orders: ShippingOrderRef[];
};

export type PoShippingRow = ShippingRow;

export type OrderStatusLogActor = {
  id: string;
  name: string | null;
  email: string;
  realEmail: string | null;
  realName: string | null;
};

export type OrderStatusLog = {
  id: string;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  purchaseOrderId: string | null;
  manufacturingOrderId: string | null;
  warehouseOrderId: string | null;
  shippingId: string | null;
  storeId: string;
  createdAt: string;
  createdById: string;
  createdBy: OrderStatusLogActor;
};

type PurchaseOrderDetailBase = {
  id: string;
  number: number;
  name: string;
  status: string;
  invoiceId: string | null;
  invoice: null | {
    id: string;
    invoiceNumber: string;
    documentKey: string | null;
  };
  documentKey: string | null;
  lines: PoLineRow[];
  osds: PoOsd[];
  statusLogs: OrderStatusLog[];
  manufacturingOrderPurchaseOrders: {
    manufacturingOrder: LinkedManufacturingOrderRef;
  }[];
  warehouseOrderPurchaseOrders: {
    warehouseOrder: LinkedWarehouseOrderRef;
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
  depositNote: string | null;

  manufacturingStartedAt: string | null;
  estimatedCompletionAt: string | null;
  manufacturingNote: string | null;

  balancePaidAt: string | null;
  balancePaidAmount: string | number | null;
  balanceRefNumber: string | null;
  balanceDocumentKey: string | null;
  balanceNote: string | null;

  readyAt: string | null;
  readyNote: string | null;
  pickedUpAt: string | null;
  pickedUpNote: string | null;
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
  quantity: number;
  cost: string | number | null;
  manufacturer: { id: string; name: string; region: string };
  purchaseOrderLine: {
    id: string;
    quantity: number;
    orderedQuantity: number;
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
  statusLogs: OrderStatusLog[];
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

export type WarehouseOrderSummaryLinkedOrder = {
  id: string;
  name: string;
  type: "distributor";
  saleChannelName: string | null;
};

export type WarehouseOrderSummary = {
  id: string;
  number: number;
  name: string;
  status: "open" | "shipped" | "closed";
  createdAt: string;
  warehouse: { id: string; name: string };
  linkedOrders: WarehouseOrderSummaryLinkedOrder[];
  shippingBadges: ShippingStatusBadge[];
};

export type WoLineAllocationRow = {
  warehouseOrderId: string;
  purchaseOrderLineId: string;
  quantity: number;
  purchaseOrderLine: {
    id: string;
    quantity: number;
    orderedQuantity: number;
    unitCost: string | number | null;
    unitPrice: string | number | null;
    product: Product;
    purchaseOrder: {
      id: string;
      number: number;
      name: string;
      type: "distributor";
      saleChannel: { name: string } | null;
    };
  };
};

export type WarehouseOrderDetail = {
  id: string;
  number: number;
  name: string;
  status: "open" | "shipped" | "closed";
  documentKey: string | null;
  warehouseId: string;
  warehouse: Warehouse;
  createdAt: string;
  updatedAt: string;
  statusLogs: OrderStatusLog[];
  purchaseOrders: {
    purchaseOrderId: string;
    purchaseOrder: {
      id: string;
      number: number;
      name: string;
      status: string;
      type: "distributor";
      saleChannel: { id: string; name: string; type: string; logoKey: string | null } | null;
    };
  }[];
  lineAllocations: WoLineAllocationRow[];
  shippings: ShippingRow[];
};

/** Last-updated non-closed PO / SO / MO for global search “Recommended”. */
export type RecommendedOpenItem = {
  kind: "po" | "mo" | "so" | "wo";
  id: string;
  name: string;
  number: number;
  status: string;
  updatedAt: string;
};
