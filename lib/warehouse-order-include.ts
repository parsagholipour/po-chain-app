import { orderStatusLogInclude } from "@/lib/order-status-log";

/** Prisma `include` for warehouse order detail API responses. */
export const warehouseOrderDetailInclude = {
  warehouse: true,
  purchaseOrders: {
    include: {
      purchaseOrder: {
        include: {
          saleChannel: true,
        },
      },
    },
  },
  lineAllocations: {
    include: {
      purchaseOrderLine: {
        include: {
          product: {
            include: {
              defaultManufacturer: true,
              category: true,
              type: true,
              collection: true,
            },
          },
          purchaseOrder: {
            select: {
              id: true,
              number: true,
              name: true,
              type: true,
              saleChannel: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  warehouseOrderShippings: {
    include: {
      shipping: {
        include: {
          logisticsPartner: true,
          warehouseOrderShippings: {
            include: {
              warehouseOrder: {
                select: {
                  id: true,
                  number: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  },
  statusLogs: {
    orderBy: { createdAt: "desc" as const },
    include: orderStatusLogInclude,
  },
} as const;
