import { after, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { moneyToCents } from "@/lib/distributor-orders/money";
import { jsonFromZod } from "@/lib/json-error";
import { dispatchNotificationEmailsSafely } from "@/lib/notifications";
import { SHOPIFY_PROVIDER } from "@/lib/payments/providers";
import { prisma } from "@/lib/prisma";
import { extractShopifyCheckoutCorrelation } from "@/lib/shopify/checkout";
import {
  applyShopifyOrderPaid,
  SHOPIFY_WEBHOOK_ATTEMPT_NOT_FOUND,
  SHOPIFY_WEBHOOK_STORE_MISMATCH,
} from "@/lib/shopify/checkout-finalize";
import { normalizeShopifyDomain } from "@/lib/shopify/domain";
import {
  decryptShopifySecret,
  encryptShopifySecret,
  isLegacyShopifySecret,
} from "@/lib/shopify/encryption";
import { isOrdersPaidTopic, verifyShopifyWebhookHmac } from "@/lib/shopify/webhooks";
import { shopifyOrderWebhookSchema } from "@/lib/validations/shopify-order-webhook";

export const runtime = "nodejs";

const paramsSchema = z.object({ integrationId: z.uuid() });

const PAID_FINANCIAL_STATUSES = new Set(["paid", "partially_refunded"]);

/**
 * Every terminal outcome except a bad HMAC answers 200: Shopify deletes the subscription
 * after 8 consecutive non-2xx deliveries.
 */
function ignored(reason: string) {
  return NextResponse.json({ ignored: true, reason });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await ctx.params;
  const parsedParams = paramsSchema.safeParse({ integrationId });
  if (!parsedParams.success) return jsonFromZod(parsedParams.error);

  const integration = await prisma.shopifyIntegration.findUnique({
    where: { id: parsedParams.data.integrationId },
    select: {
      id: true,
      storeId: true,
      enabled: true,
      checkoutEnabled: true,
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
    after(async () => {
      try {
        await prisma.shopifyIntegration.update({
          where: { id: integration.id },
          data: { webhookSecretEncrypted: await encryptShopifySecret(secret) },
        });
      } catch (error) {
        console.error("[shopify-orders-paid] secret re-encryption failed", integration.id, error);
      }
    });
  }

  const topic = request.headers.get("x-shopify-topic");
  if (!isOrdersPaidTopic(topic)) return ignored("unexpected_topic");

  const shopDomain = request.headers.get("x-shopify-shop-domain");
  if (shopDomain) {
    try {
      if (normalizeShopifyDomain(shopDomain) !== integration.shopDomain) {
        return ignored("shop_mismatch");
      }
    } catch {
      return ignored("shop_mismatch");
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return ignored("unparseable_body");
  }
  const parsedBody = shopifyOrderWebhookSchema.safeParse(payload);
  if (!parsedBody.success) return ignored("unparseable_body");
  const body = parsedBody.data;

  if (body.cancelled_at) return ignored("order_cancelled");

  const financialStatus = body.financial_status?.trim().toLowerCase() ?? "";
  if (!PAID_FINANCIAL_STATUSES.has(financialStatus)) return ignored("not_paid");

  if (body.test === true && process.env.NODE_ENV === "production") return ignored("test_order");

  const correlation = extractShopifyCheckoutCorrelation(body);
  if (!correlation.checkoutToken) return ignored("not_a_po_app_order");

  const attempt = await prisma.paymentAttempt.findUnique({
    where: { correlationToken: correlation.checkoutToken },
    select: {
      id: true,
      storeId: true,
      invoiceId: true,
      status: true,
      amount: true,
      currency: true,
      provider: true,
      providerMetadata: true,
    },
  });
  if (!attempt || attempt.provider !== SHOPIFY_PROVIDER) return ignored("unknown_checkout_token");
  if (correlation.storeId && correlation.storeId !== attempt.storeId) {
    return ignored("store_mismatch");
  }
  if (attempt.storeId !== integration.storeId) return ignored("store_mismatch");
  if (attempt.status === "paid") return ignored("already_paid");

  const orderGid =
    body.admin_graphql_api_id ?? (body.id != null ? `gid://shopify/Order/${body.id}` : null);
  if (!orderGid) return ignored("unparseable_body");
  const providerEventId =
    request.headers.get("x-shopify-webhook-id")?.trim() || `shopify-order:${orderGid}`;

  try {
    const result = await prisma.$transaction(
      (tx) =>
        applyShopifyOrderPaid({
          tx,
          paymentAttempt: attempt,
          order: {
            gid: orderGid,
            name: body.name ?? null,
            totalCents: moneyToCents(body.total_price),
            currency: body.currency ?? null,
          },
          providerEventId,
          eventType: topic ?? "orders/paid",
          payload: payload as Prisma.InputJsonValue,
        }),
      { maxWait: 2000, timeout: 15000 },
    );

    after(() => dispatchNotificationEmailsSafely(result.notificationIds));

    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (e instanceof Error && e.message === SHOPIFY_WEBHOOK_ATTEMPT_NOT_FOUND) {
      return ignored("invoice_not_found");
    }
    if (e instanceof Error && e.message === SHOPIFY_WEBHOOK_STORE_MISMATCH) {
      return ignored("store_mismatch");
    }
    throw e;
  }
}
