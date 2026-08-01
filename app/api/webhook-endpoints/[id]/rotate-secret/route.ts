import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { encryptWebhookSecret } from "@/lib/webhooks/encryption";
import { webhookEndpointSelect } from "@/lib/webhooks/endpoint-select";
import { generateWebhookSecret, webhookSecretLast4 } from "@/lib/webhooks/signature";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

/** Replaces the signing secret. Deliveries in flight keep using the old one. */
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

  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: pid.data.id, storeId },
    select: { id: true },
  });
  if (!existing) return jsonError("Not found", 404);

  const secret = generateWebhookSecret();

  try {
    const row = await prisma.webhookEndpoint.update({
      where: { id: pid.data.id },
      data: {
        secretEncrypted: await encryptWebhookSecret(secret),
        secretLast4: webhookSecretLast4(secret),
      },
      select: webhookEndpointSelect,
    });
    return NextResponse.json({ ...row, secret });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
