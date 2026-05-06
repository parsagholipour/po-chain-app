import { orderStatusLogInclude } from "@/lib/order-status-log";

/** Single PO line shape for API responses (detail, line PATCH/POST/GET). */
export const purchaseOrderLineApiInclude = {
  product: { include: { defaultManufacturer: true, category: true, type: true, collection: true } },
  manufacturingOrderLines: {
    select: {
      manufacturingOrderId: true,
      manufacturerId: true,
      quantity: true,
      manufacturingOrder: { select: { id: true, number: true, name: true } },
      manufacturer: { select: { id: true, name: true } },
    },
  },
  warehouseOrderLines: {
    select: {
      warehouseOrderId: true,
      quantity: true,
      warehouseOrder: { select: { id: true, number: true, name: true } },
    },
  },
} as const;

/** Prisma `include` for OS&D rows (list/detail). */
export const purchaseOrderOsdListInclude = {
  lines: {
    include: {
      purchaseOrderLine: {
        include: { product: { include: { defaultManufacturer: true, category: true, type: true, collection: true } } },
      },
    },
  },
  manufacturingOrder: { select: { id: true, number: true, name: true } },
} as const;

/** Prisma `include` for purchase order detail API responses. */
export const purchaseOrderDetailInclude = {
  invoice: true,
  saleChannel: true,
  lines: {
    include: purchaseOrderLineApiInclude,
    orderBy: { createdAt: "asc" as const },
  },
  manufacturingOrderPurchaseOrders: {
    include: {
      manufacturingOrder: {
        select: {
          id: true,
          number: true,
          name: true,
          status: true,
        },
      },
    },
  },
  warehouseOrderPurchaseOrders: {
    include: {
      warehouseOrder: {
        select: {
          id: true,
          number: true,
          name: true,
          status: true,
          warehouse: { select: { id: true, name: true } },
        },
      },
    },
  },
  purchaseOrderShippings: {
    include: {
      shipping: {
        include: {
          logisticsPartner: true,
          purchaseOrderShippings: {
            include: {
              purchaseOrder: {
                select: {
                  id: true,
                  number: true,
                  name: true,
                  status: true,
                  type: true,
                },
              },
            },
          },
        },
      },
    },
  },
  osds: {
    orderBy: { createdAt: "desc" as const },
    include: purchaseOrderOsdListInclude,
  },
  statusLogs: {
    orderBy: { createdAt: "desc" as const },
    include: orderStatusLogInclude,
  },
} as const;
