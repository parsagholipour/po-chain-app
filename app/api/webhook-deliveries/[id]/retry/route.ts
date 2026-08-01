import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { retryWebhookDelivery } from "@/lib/webhooks/delivery";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const replayed = await retryWebhookDelivery({ deliveryId: pid.data.id, storeId });
  if (!replayed) return jsonError("Not found", 404);

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: pid.data.id },
    select: {
      id: true,
      status: true,
      attemptCount: true,
      responseStatus: true,
      lastError: true,
      nextAttemptAt: true,
    },
  });
  return NextResponse.json(delivery);
}
