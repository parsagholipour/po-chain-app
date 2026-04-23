import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

export const orderStatusLogInclude = {
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
      realEmail: true,
      realName: true,
    },
  },
} as const;

export type OrderStatusLogWithRelations = Prisma.OrderStatusLogGetPayload<{
  include: typeof orderStatusLogInclude;
}>;

type CreateOrderStatusLogInput = {
  tx: Prisma.TransactionClient;
  storeId: string;
  createdById: string;
  fromStatus: string;
  toStatus: string;
} & (
  | {
      purchaseOrderId: string;
      manufacturingOrderId?: never;
      shippingId?: never;
    }
  | {
      purchaseOrderId?: never;
      manufacturingOrderId: string;
      shippingId?: never;
    }
  | {
      purchaseOrderId?: never;
      manufacturingOrderId?: never;
      shippingId: string;
    }
);

export async function createOrderStatusLog({
  tx,
  storeId,
  createdById,
  fromStatus,
  toStatus,
  ...parent
}: CreateOrderStatusLogInput) {
  if (fromStatus === toStatus) {
    return;
  }

  await tx.orderStatusLog.create({
    data: {
      ...parent,
      storeId,
      createdById,
      fromStatus,
      toStatus,
    },
  });
}

export function orderStatusLogFromPrisma(log: OrderStatusLogWithRelations) {
  return {
    id: log.id,
    fromStatus: log.fromStatus,
    toStatus: log.toStatus,
    note: log.note ?? null,
    purchaseOrderId: log.purchaseOrderId,
    manufacturingOrderId: log.manufacturingOrderId,
    shippingId: log.shippingId,
    storeId: log.storeId,
    createdAt: log.createdAt.toISOString(),
    createdById: log.createdById,
    createdBy: {
      id: log.createdBy.id,
      name: log.createdBy.name,
      email: log.createdBy.email,
      realEmail: log.createdBy.realEmail,
      realName: log.createdBy.realName,
    },
  };
}
