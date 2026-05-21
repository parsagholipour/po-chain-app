import "server-only";

import { prisma } from "@/lib/prisma";
import { PaymentProviderConfigError } from "@/lib/payments/types";

const PGCRYPTO_ENCRYPTION_PREFIX = "pgp";

type SecretValueRow = {
  value: string | null;
};

function getPaymentProviderPassphrase() {
  const raw = process.env.PAYMENT_PROVIDER_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new PaymentProviderConfigError("PAYMENT_PROVIDER_ENCRYPTION_KEY is not set");
  }
  return raw;
}

function scopedPassphrase(storeId: string) {
  if (!storeId) {
    throw new PaymentProviderConfigError("A store id is required to encrypt payment secrets");
  }
  return `${getPaymentProviderPassphrase()}:${storeId}`;
}

export async function encryptPaymentSecret(value: string, storeId: string) {
  const [row] = await prisma.$queryRaw<SecretValueRow[]>`
    SELECT encode(
      pgp_sym_encrypt(${value}, ${scopedPassphrase(storeId)}, 'cipher-algo=aes256'),
      'base64'
    ) AS "value"
  `;

  if (!row?.value) {
    throw new PaymentProviderConfigError("Could not encrypt payment provider secret");
  }

  return `${PGCRYPTO_ENCRYPTION_PREFIX}:${row.value}`;
}

export async function decryptPaymentSecret(value: string, storeId: string) {
  const [version, encryptedRaw] = value.split(":", 2);

  if (version !== PGCRYPTO_ENCRYPTION_PREFIX || !encryptedRaw) {
    throw new PaymentProviderConfigError("Invalid payment provider secret format");
  }

  const [row] = await prisma.$queryRaw<SecretValueRow[]>`
    SELECT pgp_sym_decrypt(
      decode(${encryptedRaw}, 'base64'),
      ${scopedPassphrase(storeId)}
    ) AS "value"
  `;

  if (row?.value == null) {
    throw new PaymentProviderConfigError("Could not decrypt payment provider secret");
  }

  return row.value;
}
