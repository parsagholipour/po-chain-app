import { NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { z } from "zod";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import { prisma } from "@/lib/prisma";
import {
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });
const patchSchema = z.object({ read: z.boolean() });

function visibleNotificationWhere({
  id,
  storeId,
  saleChannelId,
  isDistributor,
}: {
  id: string;
  storeId: string;
  saleChannelId: string | null;
  isDistributor: boolean;
}): Prisma.NotificationWhereInput {
  return isDistributor
    ? {
        id,
        storeId,
        audience: "distributor",
        saleChannelId,
      }
    : {
        id,
        storeId,
        audience: "store_owner",
      };
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;

  const { id } = await ctx.params;
  const parsedParams = paramsSchema.safeParse({ id });
  if (!parsedParams.success) return jsonFromZod(parsedParams.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const { storeId, userId } = authz.context;
  const isDistributor = isDistributorContext(authz.context);
  const saleChannelId = authz.context.saleChannelId;
  if (isDistributor && !saleChannelId) {
    return jsonError("Distributor account is not linked to a sale channel", 403);
  }

  const notification = await prisma.notification.findFirst({
    where: visibleNotificationWhere({
      id: parsedParams.data.id,
      storeId,
      saleChannelId,
      isDistributor,
    }),
    select: { id: true },
  });
  if (!notification) return jsonError("Not found", 404);

  if (parsed.data.read) {
    const read = await prisma.notificationRead.upsert({
      where: {
        notificationId_userId: {
          notificationId: notification.id,
          userId,
        },
      },
      update: { readAt: new Date() },
      create: {
        notificationId: notification.id,
        userId,
      },
      select: { readAt: true },
    });
    return NextResponse.json({ readAt: read.readAt.toISOString() });
  }

  await prisma.notificationRead.deleteMany({
    where: {
      notificationId: notification.id,
      userId,
    },
  });
  return NextResponse.json({ readAt: null });
}
