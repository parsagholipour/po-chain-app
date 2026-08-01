import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { enqueueWebhookTestEvent } from "@/lib/webhooks/delivery";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

/** Sends a `webhook.test` event through the real signing + delivery path. */
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

  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id: pid.data.id, storeId },
    select: { id: true, enabled: true },
  });
  if (!endpoint) return jsonError("Not found", 404);
  if (!endpoint.enabled) return jsonError("Enable the endpoint before testing it", 400);

  const deliveryId = await enqueueWebhookTestEvent({ storeId, endpointId: endpoint.id });

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      status: true,
      attemptCount: true,
      responseStatus: true,
      lastError: true,
    },
  });

  return NextResponse.json(delivery, { status: 201 });
}
