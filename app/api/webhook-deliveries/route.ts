import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const statusSchema = z.enum(["pending", "succeeded", "failed"]);

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const where: Prisma.WebhookDeliveryWhereInput = { storeId };

  const statusRaw = searchParams.get("status");
  if (statusRaw) {
    const status = statusSchema.safeParse(statusRaw);
    if (!status.success) return jsonError("Invalid status filter", 400);
    where.status = status.data;
  }

  const endpointIdRaw = searchParams.get("endpointId");
  if (endpointIdRaw) {
    const endpointId = z.uuid().safeParse(endpointIdRaw);
    if (!endpointId.success) return jsonError("Invalid endpointId", 400);
    where.endpointId = endpointId.data;
  }

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(
    parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  const [total, rows] = await prisma.$transaction([
    prisma.webhookDelivery.count({ where }),
    prisma.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        event: true,
        status: true,
        attemptCount: true,
        nextAttemptAt: true,
        deliveredAt: true,
        responseStatus: true,
        lastError: true,
        createdAt: true,
        endpoint: { select: { id: true, url: true } },
      },
    }),
  ]);

  return NextResponse.json({ rows, total, page, pageSize });
}
