import { after, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonFromZod } from "@/lib/json-error";
import { decryptCrmSecret } from "@/lib/crm/encryption";
import { handleCrmLeadWebhookEvent } from "@/lib/crm/webhooks";
import { verifyWebhookSignature } from "@/lib/webhooks/signature";

export const runtime = "nodejs";

const paramsSchema = z.object({ integrationId: z.uuid() });

export async function POST(
  request: Request,
  ctx: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await ctx.params;
  const parsed = paramsSchema.safeParse({ integrationId });
  if (!parsed.success) return jsonFromZod(parsed.error);

  const integration = await prisma.crmIntegration.findUnique({
    where: { id: parsed.data.integrationId },
    select: {
      id: true,
      storeId: true,
      enabled: true,
      webhookSecretEncrypted: true,
      organizationId: true,
    },
  });
  if (!integration?.enabled || !integration.webhookSecretEncrypted) {
    return NextResponse.json({ message: "Webhook not configured" }, { status: 404 });
  }

  const rawBody = await request.text();
  const secret = await decryptCrmSecret(integration.webhookSecretEncrypted);
  const valid = verifyWebhookSignature({
    payload: rawBody,
    secret,
    header: request.headers.get("x-crm-signature"),
  });
  if (!valid) {
    return NextResponse.json({ message: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const deliveryId = request.headers.get("x-crm-delivery");

  after(async () => {
    try {
      await handleCrmLeadWebhookEvent({
        storeId: integration.storeId,
        integrationId: integration.id,
        organizationId: integration.organizationId,
        payload,
        deliveryId,
      });
    } catch (error) {
      console.error("[crm-webhook] handler failed", integration.id, error);
    }
  });

  return NextResponse.json({ received: true });
}
