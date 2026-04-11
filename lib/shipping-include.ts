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
} as const;
