import { orderStatusLogInclude } from "@/lib/order-status-log";

export const shippingDetailInclude = {
  logisticsPartner: true,
  manufacturingOrderShippings: {
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
  statusLogs: {
    orderBy: { createdAt: "desc" as const },
    include: orderStatusLogInclude,
  },
} as const;
