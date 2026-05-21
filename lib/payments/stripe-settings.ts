import "server-only";

import { normalizeCurrency } from "@/lib/distributor-orders/money";
import { prisma } from "@/lib/prisma";
import { decryptPaymentSecret } from "@/lib/payments/credential-encryption";
import { STRIPE_PROVIDER } from "@/lib/payments/providers";
import { PaymentProviderConfigError } from "@/lib/payments/types";

type StripeSettingRow = {
  id: string;
  storeId: string;
  enabled: boolean;
  currency: string;
  secretKeyEncrypted: string | null;
  webhookSecretEncrypted: string | null;
};

export type StripeStoreCredentials = {
  settingId: string;
  storeId: string;
  secretKey: string;
  webhookSecret: string;
  currency: string;
};

export type StripeWebhookCredentials = {
  settingId: string;
  storeId: string;
  webhookSecret: string;
  currency: string;
};

function missingStripeSettingsError() {
  return new PaymentProviderConfigError(
    "Stripe is not configured for this store. Add store-specific Stripe keys in Settings > Integrations.",
  );
}

function assertConfigured(
  row: StripeSettingRow | null,
): asserts row is StripeSettingRow & {
  secretKeyEncrypted: string;
  webhookSecretEncrypted: string;
} {
  if (!row || !row.enabled) throw missingStripeSettingsError();
  if (!row.secretKeyEncrypted) {
    throw new PaymentProviderConfigError("Stripe secret key is missing for this store");
  }
  if (!row.webhookSecretEncrypted) {
    throw new PaymentProviderConfigError("Stripe webhook signing secret is missing for this store");
  }
}

export async function getStripeCredentialsForStore(
  storeId: string,
): Promise<StripeStoreCredentials> {
  const row = await prisma.storePaymentProviderSetting.findUnique({
    where: {
      storeId_provider: {
        storeId,
        provider: STRIPE_PROVIDER,
      },
    },
    select: {
      id: true,
      storeId: true,
      enabled: true,
      currency: true,
      secretKeyEncrypted: true,
      webhookSecretEncrypted: true,
    },
  });

  assertConfigured(row);

  return {
    settingId: row.id,
    storeId: row.storeId,
    secretKey: await decryptPaymentSecret(row.secretKeyEncrypted, row.storeId),
    webhookSecret: await decryptPaymentSecret(row.webhookSecretEncrypted, row.storeId),
    currency: normalizeCurrency(row.currency),
  };
}

export async function listStripeWebhookCredentials(): Promise<StripeWebhookCredentials[]> {
  const rows = await prisma.storePaymentProviderSetting.findMany({
    where: {
      provider: STRIPE_PROVIDER,
      enabled: true,
      webhookSecretEncrypted: { not: null },
      secretKeyEncrypted: { not: null },
    },
    select: {
      id: true,
      storeId: true,
      enabled: true,
      currency: true,
      secretKeyEncrypted: true,
      webhookSecretEncrypted: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (rows.length === 0) throw missingStripeSettingsError();

  const credentials: StripeWebhookCredentials[] = [];
  for (const row of rows) {
    assertConfigured(row);
    credentials.push({
      settingId: row.id,
      storeId: row.storeId,
      webhookSecret: await decryptPaymentSecret(row.webhookSecretEncrypted, row.storeId),
      currency: normalizeCurrency(row.currency),
    });
  }
  return credentials;
}
