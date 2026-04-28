import { orderStatusLogInclude } from "@/lib/order-status-log";

/** Single PO line shape for API responses (detail, line PATCH/POST/GET). */
export const purchaseOrderLineApiInclude = {
  product: { include: { defaultManufacturer: true, category: true, type: true } },
  manufacturingOrderLines: {
    select: {
      manufacturingOrderId: true,
      manufacturerId: true,
      manufacturingOrder: { select: { id: true, number: true, name: true } },
      manufacturer: { select: { id: true, name: true } },
    },
  },
} as const;

/** Prisma `include` for OS&D rows (list/detail). */
export const purchaseOrderOsdListInclude = {
  lines: {
    include: {
      purchaseOrderLine: {
        include: { product: { include: { defaultManufacturer: true, category: true, type: true } } },
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
