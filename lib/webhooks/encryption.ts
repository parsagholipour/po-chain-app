import "server-only";

import { prisma } from "@/lib/prisma";

const PGCRYPTO_ENCRYPTION_PREFIX = "pgp";

type SecretValueRow = {
  value: string | null;
};

function getPgcryptoPassphrase() {
  const raw =
    process.env.WEBHOOK_SIGNING_ENCRYPTION_KEY ||
    process.env.PAYMENT_PROVIDER_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("WEBHOOK_SIGNING_ENCRYPTION_KEY is not set");
  }
  return raw;
}

export async function encryptWebhookSecret(value: string) {
  const [row] = await prisma.$queryRaw<SecretValueRow[]>`
    SELECT encode(
      pgp_sym_encrypt(${value}, ${getPgcryptoPassphrase()}, 'cipher-algo=aes256'),
      'base64'
    ) AS "value"
  `;

  if (!row?.value) {
    throw new Error("Could not encrypt webhook signing secret");
  }

  return `${PGCRYPTO_ENCRYPTION_PREFIX}:${row.value}`;
}

export async function decryptWebhookSecret(value: string) {
  const [version, encryptedRaw] = value.split(":", 2);
  if (version !== PGCRYPTO_ENCRYPTION_PREFIX || !encryptedRaw) {
    throw new Error("Invalid webhook signing secret format");
  }

  const [row] = await prisma.$queryRaw<SecretValueRow[]>`
    SELECT pgp_sym_decrypt(
      decode(${encryptedRaw}, 'base64'),
      ${getPgcryptoPassphrase()}
    ) AS "value"
  `;

  if (row?.value == null) {
    throw new Error("Could not decrypt webhook signing secret");
  }
  return row.value;
}
