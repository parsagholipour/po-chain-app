/** Prisma `include` for manufacturing order detail API responses. */
export const manufacturingOrderDetailInclude = {
  manufacturers: { include: { manufacturer: true, invoice: true } },
  purchaseOrders: {
    include: { purchaseOrder: { include: { saleChannel: true } } },
  },
  lineAllocations: {
    include: {
      purchaseOrderLine: {
        include: {
          product: { include: { defaultManufacturer: true } },
          purchaseOrder: { select: { id: true, number: true, name: true, type: true } },
        },
      },
      manufacturer: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
  manufacturingOrderShippings: {
    include: {
      manufacturingShipping: true,
    },
  },
} as const;
