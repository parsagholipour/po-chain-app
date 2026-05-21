import { after, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonFromZod } from "@/lib/json-error";
import { normalizeShopifyDomain } from "@/lib/shopify/domain";
import {
  decryptShopifySecret,
  encryptShopifySecret,
  isLegacyShopifySecret,
} from "@/lib/shopify/encryption";
import { syncShopifyIntegrationById } from "@/lib/shopify/sync";
import {
  isInventoryLevelsUpdateTopic,
  verifyShopifyWebhookHmac,
} from "@/lib/shopify/webhooks";

export const runtime = "nodejs";

const paramsSchema = z.object({ integrationId: z.uuid() });

export async function POST(
  request: Request,
  ctx: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await ctx.params;
  const parsed = paramsSchema.safeParse({ integrationId });
  if (!parsed.success) return jsonFromZod(parsed.error);

  const integration = await prisma.shopifyIntegration.findUnique({
    where: { id: parsed.data.integrationId },
    select: {
      id: true,
      enabled: true,
      shopDomain: true,
      webhookSecretEncrypted: true,
    },
  });
  if (!integration?.webhookSecretEncrypted) {
    return NextResponse.json({ message: "Webhook not configured" }, { status: 404 });
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  const secret = await decryptShopifySecret(integration.webhookSecretEncrypted);
  const validHmac = verifyShopifyWebhookHmac({
    rawBody,
    secret,
    hmacHeader: request.headers.get("x-shopify-hmac-sha256"),
  });
  if (!validHmac) {
    return NextResponse.json({ message: "Invalid webhook signature" }, { status: 401 });
  }
  if (isLegacyShopifySecret(integration.webhookSecretEncrypted)) {
    await prisma.shopifyIntegration.update({
      where: { id: integration.id },
      data: { webhookSecretEncrypted: await encryptShopifySecret(secret) },
    });
  }

  const topic = request.headers.get("x-shopify-topic");
  if (!isInventoryLevelsUpdateTopic(topic)) {
    return NextResponse.json({ message: "Unexpected webhook topic" }, { status: 400 });
  }

  const shopDomain = request.headers.get("x-shopify-shop-domain");
  if (shopDomain) {
    try {
      if (normalizeShopifyDomain(shopDomain) !== integration.shopDomain) {
        return NextResponse.json({ message: "Unexpected shop domain" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ message: "Invalid shop domain" }, { status: 400 });
    }
  }

  if (integration.enabled) {
    after(async () => {
      try {
        await syncShopifyIntegrationById(integration.id, "webhook");
      } catch (error) {
        console.error("[shopify-webhook] inventory sync failed", integration.id, error);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
