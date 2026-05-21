import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeCurrency } from "@/lib/distributor-orders/money";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { encryptPaymentSecret } from "@/lib/payments/credential-encryption";
import { STRIPE_PROVIDER } from "@/lib/payments/providers";
import { PaymentProviderConfigError } from "@/lib/payments/types";
import { stripeIntegrationUpdateSchema } from "@/lib/validations/stripe-integration";

export const runtime = "nodejs";

type StripeSettingsRow = {
  id: string;
  enabled: boolean;
  currency: string;
  secretKeyEncrypted: string | null;
  webhookSecretEncrypted: string | null;
  secretKeyLast4: string | null;
  webhookSecretLast4: string | null;
  updatedAt: Date;
} | null;

function last4(value: string) {
  return value.slice(-4);
}

function stripeSettingsResponse(row: StripeSettingsRow) {
  if (!row) {
    return {
      id: null,
      enabled: false,
      currency: "usd",
      hasSecretKey: false,
      hasWebhookSecret: false,
      secretKeyLast4: null,
      webhookSecretLast4: null,
      updatedAt: null,
    };
  }

  return {
    id: row.id,
    enabled: row.enabled,
    currency: normalizeCurrency(row.currency),
    hasSecretKey: row.secretKeyEncrypted != null,
    hasWebhookSecret: row.webhookSecretEncrypted != null,
    secretKeyLast4: row.secretKeyLast4,
    webhookSecretLast4: row.webhookSecretLast4,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const row = await prisma.storePaymentProviderSetting.findUnique({
    where: {
      storeId_provider: {
        storeId,
        provider: STRIPE_PROVIDER,
      },
    },
  });
  return NextResponse.json(stripeSettingsResponse(row));
}

export async function PATCH(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId, userId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = stripeIntegrationUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const existing = await prisma.storePaymentProviderSetting.findUnique({
      where: {
        storeId_provider: {
          storeId,
          provider: STRIPE_PROVIDER,
        },
      },
    });

    const nextSecretKeyEncrypted = parsed.data.secretKey
      ? await encryptPaymentSecret(parsed.data.secretKey, storeId)
      : existing?.secretKeyEncrypted ?? null;
    const nextWebhookSecretEncrypted = parsed.data.webhookSecret
      ? await encryptPaymentSecret(parsed.data.webhookSecret, storeId)
      : existing?.webhookSecretEncrypted ?? null;
    const nextSecretKeyLast4 = parsed.data.secretKey
      ? last4(parsed.data.secretKey)
      : existing?.secretKeyLast4 ?? null;
    const nextWebhookSecretLast4 = parsed.data.webhookSecret
      ? last4(parsed.data.webhookSecret)
      : existing?.webhookSecretLast4 ?? null;

    if (parsed.data.enabled && !nextSecretKeyEncrypted) {
      return jsonError("Stripe secret key is required before enabling", 400);
    }
    if (parsed.data.enabled && !nextWebhookSecretEncrypted) {
      return jsonError("Stripe webhook signing secret is required before enabling", 400);
    }

    const saved = await prisma.storePaymentProviderSetting.upsert({
      where: {
        storeId_provider: {
          storeId,
          provider: STRIPE_PROVIDER,
        },
      },
      create: {
        storeId,
        provider: STRIPE_PROVIDER,
        enabled: parsed.data.enabled,
        currency: normalizeCurrency(parsed.data.currency),
        secretKeyEncrypted: nextSecretKeyEncrypted,
        webhookSecretEncrypted: nextWebhookSecretEncrypted,
        secretKeyLast4: nextSecretKeyLast4,
        webhookSecretLast4: nextWebhookSecretLast4,
        createdById: userId,
        updatedById: userId,
      },
      update: {
        enabled: parsed.data.enabled,
        currency: normalizeCurrency(parsed.data.currency),
        secretKeyEncrypted: nextSecretKeyEncrypted,
        webhookSecretEncrypted: nextWebhookSecretEncrypted,
        secretKeyLast4: nextSecretKeyLast4,
        webhookSecretLast4: nextWebhookSecretLast4,
        updatedById: userId,
      },
    });

    return NextResponse.json(stripeSettingsResponse(saved));
  } catch (e) {
    if (e instanceof PaymentProviderConfigError) {
      return jsonError(e.message, 503);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
