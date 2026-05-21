import "server-only";

import { createDecipheriv } from "node:crypto";
import { prisma } from "@/lib/prisma";

const ALGORITHM = "aes-256-gcm";
const LEGACY_ENCRYPTION_PREFIX = "v1";
const PGCRYPTO_ENCRYPTION_PREFIX = "pgp";

type SecretValueRow = {
  value: string | null;
};

function getPgcryptoPassphrase() {
  const raw = process.env.SHOPIFY_INTEGRATION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SHOPIFY_INTEGRATION_ENCRYPTION_KEY is not set");
  }
  return raw;
}

function getLegacyEncryptionKey() {
  const raw = process.env.SHOPIFY_INTEGRATION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SHOPIFY_INTEGRATION_ENCRYPTION_KEY is not set");
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SHOPIFY_INTEGRATION_ENCRYPTION_KEY must be a base64 encoded 32-byte key");
  }
  return key;
}

function decryptLegacyShopifySecret(value: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  if (version !== LEGACY_ENCRYPTION_PREFIX || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid Shopify secret format");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getLegacyEncryptionKey(),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function encryptShopifySecret(value: string) {
  const [row] = await prisma.$queryRaw<SecretValueRow[]>`
    SELECT encode(
      pgp_sym_encrypt(${value}, ${getPgcryptoPassphrase()}, 'cipher-algo=aes256'),
      'base64'
    ) AS "value"
  `;

  if (!row?.value) {
    throw new Error("Could not encrypt Shopify secret");
  }

  return `${PGCRYPTO_ENCRYPTION_PREFIX}:${row.value}`;
}

export async function decryptShopifySecret(value: string) {
  const [version, encryptedRaw] = value.split(":", 2);

  if (version === PGCRYPTO_ENCRYPTION_PREFIX && encryptedRaw) {
    const [row] = await prisma.$queryRaw<SecretValueRow[]>`
      SELECT pgp_sym_decrypt(
        decode(${encryptedRaw}, 'base64'),
        ${getPgcryptoPassphrase()}
      ) AS "value"
    `;

    if (row?.value == null) {
      throw new Error("Could not decrypt Shopify secret");
    }
    return row.value;
  }

  if (version === LEGACY_ENCRYPTION_PREFIX) {
    return decryptLegacyShopifySecret(value);
  }

  throw new Error("Invalid Shopify secret format");
}

export function isLegacyShopifySecret(value: string) {
  return value.startsWith(`${LEGACY_ENCRYPTION_PREFIX}:`);
}
