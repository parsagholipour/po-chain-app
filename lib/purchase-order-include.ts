/** Prisma `include` for purchase order detail API responses. */
export const purchaseOrderDetailInclude = {
  saleChannel: true,
  lines: {
    include: {
      product: { include: { defaultManufacturer: true, category: true } },
    },
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
} as const;
