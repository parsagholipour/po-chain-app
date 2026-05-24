import { NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { jsonError } from "@/lib/json-error";
import { prisma } from "@/lib/prisma";
import {
  isDistributorContext,
  requireStoreContext,
} from "@/lib/store-context";

export const runtime = "nodejs";

const MAX_LIMIT = 50;

function notificationFromPrisma(row: {
  id: string;
  type: string;
  priority: string;
  audience: string;
  title: string;
  body: string;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
  data: unknown;
  createdAt: Date;
  reads: Array<{ readAt: Date }>;
}) {
  return {
    id: row.id,
    type: row.type,
    priority: row.priority,
    audience: row.audience,
    title: row.title,
    body: row.body,
    href: row.href,
    entityType: row.entityType,
    entityId: row.entityId,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
    readAt: row.reads[0]?.readAt.toISOString() ?? null,
  };
}

function parseLimit(raw: string | null) {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, MAX_LIMIT);
}

function visibleNotificationWhere({
  storeId,
  saleChannelId,
  isDistributor,
}: {
  storeId: string;
  saleChannelId: string | null;
  isDistributor: boolean;
}): Prisma.NotificationWhereInput {
  return isDistributor
    ? {
        storeId,
        audience: "distributor",
        saleChannelId,
      }
    : {
        storeId,
        audience: "store_owner",
      };
}

export async function GET(request: Request) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;

  const { storeId, userId } = authz.context;
  const isDistributor = isDistributorContext(authz.context);
  const saleChannelId = authz.context.saleChannelId;
  if (isDistributor && !saleChannelId) {
    return jsonError("Distributor account is not linked to a sale channel", 403);
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const cursor = searchParams.get("cursor");
  const unreadOnly = searchParams.get("unread") === "1";
  const where = visibleNotificationWhere({
    storeId,
    saleChannelId,
    isDistributor,
  });
  const unreadWhere: Prisma.NotificationWhereInput = {
    ...where,
    reads: { none: { userId } },
  };

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: unreadOnly ? unreadWhere : where,
      include: {
        reads: {
          where: { userId },
          select: { readAt: true },
          take: 1,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
    }),
    prisma.notification.count({ where: unreadWhere }),
  ]);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    rows: pageRows.map(notificationFromPrisma),
    unreadCount,
    nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null,
  });
}
