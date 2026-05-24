import { NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { jsonError } from "@/lib/json-error";
import { prisma } from "@/lib/prisma";
import {
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";

export const runtime = "nodejs";

function visibleUnreadWhere({
  storeId,
  userId,
  saleChannelId,
  isDistributor,
}: {
  storeId: string;
  userId: string;
  saleChannelId: string | null;
  isDistributor: boolean;
}): Prisma.NotificationWhereInput {
  return {
    storeId,
    audience: isDistributor ? "distributor" : "store_owner",
    ...(isDistributor ? { saleChannelId } : {}),
    reads: { none: { userId } },
  };
}

export async function POST() {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;

  const { storeId, userId } = authz.context;
  const isDistributor = isDistributorContext(authz.context);
  const saleChannelId = authz.context.saleChannelId;
  if (isDistributor && !saleChannelId) {
    return jsonError("Distributor account is not linked to a sale channel", 403);
  }

  const unread = await prisma.notification.findMany({
    where: visibleUnreadWhere({
      storeId,
      userId,
      saleChannelId,
      isDistributor,
    }),
    select: { id: true },
    take: 500,
  });

  if (unread.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const result = await prisma.notificationRead.createMany({
    data: unread.map((notification) => ({
      notificationId: notification.id,
      userId,
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({ updated: result.count });
}
