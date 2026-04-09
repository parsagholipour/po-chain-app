/** Prisma `include` for purchase order detail API responses. */
export const purchaseOrderDetailInclude = {
  saleChannel: true,
  lines: {
    include: {
      product: { include: { defaultManufacturer: true } },
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
} as const;
