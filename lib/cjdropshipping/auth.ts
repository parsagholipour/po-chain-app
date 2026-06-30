import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CjDropshippingClient,
  type CjAuthTokenData,
  parseCjDate,
} from "@/lib/cjdropshipping/api";
import {
  decryptCjDropshippingSecret,
  encryptCjDropshippingSecret,
} from "@/lib/cjdropshipping/encryption";

const TOKEN_REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000;

type IntegrationAuthRow = {
  id: string;
  apiKeyEncrypted: string | null;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenEncrypted: string | null;
  refreshTokenExpiresAt: Date | null;
};

function validBeyondRefreshBuffer(value: Date | null) {
  return value != null && value.getTime() > Date.now() + TOKEN_REFRESH_BUFFER_MS;
}

function requireDate(value: Date | null, label: string) {
  if (!value) throw new Error(`CJdropshipping returned an invalid ${label}`);
  return value;
}

export async function encryptedCjTokenData(data: CjAuthTokenData) {
  const accessTokenExpiresAt = requireDate(
    parseCjDate(data.accessTokenExpiryDate),
    "access token expiry date",
  );
  const refreshTokenExpiresAt = requireDate(
    parseCjDate(data.refreshTokenExpiryDate),
    "refresh token expiry date",
  );

  return {
    openId: data.openId == null ? null : String(data.openId),
    accessTokenEncrypted: await encryptCjDropshippingSecret(data.accessToken),
    accessTokenExpiresAt,
    refreshTokenEncrypted: await encryptCjDropshippingSecret(data.refreshToken),
    refreshTokenExpiresAt,
  } satisfies Prisma.CjDropshippingIntegrationUpdateInput;
}

export async function encryptedCjApiKeyAndTokenData(
  apiKey: string,
  data: CjAuthTokenData,
) {
  return {
    apiKeyEncrypted: await encryptCjDropshippingSecret(apiKey),
    ...(await encryptedCjTokenData(data)),
  } satisfies Prisma.CjDropshippingIntegrationUpdateInput;
}

async function refreshWithStoredToken(
  row: IntegrationAuthRow,
  client: CjDropshippingClient,
) {
  if (!row.refreshTokenEncrypted || !validBeyondRefreshBuffer(row.refreshTokenExpiresAt)) {
    return null;
  }

  const refreshToken = await decryptCjDropshippingSecret(row.refreshTokenEncrypted);
  const tokenData = await client.refreshAccessToken(refreshToken);
  await prisma.cjDropshippingIntegration.update({
    where: { id: row.id },
    data: await encryptedCjTokenData(tokenData),
  });
  return tokenData.accessToken;
}

async function reauthorizeWithStoredApiKey(
  row: IntegrationAuthRow,
  client: CjDropshippingClient,
) {
  if (!row.apiKeyEncrypted) {
    throw new Error("CJdropshipping API key is not configured");
  }

  const apiKey = await decryptCjDropshippingSecret(row.apiKeyEncrypted);
  const tokenData = await client.authenticateWithApiKey(apiKey);
  await prisma.cjDropshippingIntegration.update({
    where: { id: row.id },
    data: await encryptedCjTokenData(tokenData),
  });
  return tokenData.accessToken;
}

export async function ensureCjAccessToken(
  integrationId: string,
  client = new CjDropshippingClient(),
) {
  const row = await prisma.cjDropshippingIntegration.findUnique({
    where: { id: integrationId },
    select: {
      id: true,
      apiKeyEncrypted: true,
      accessTokenEncrypted: true,
      accessTokenExpiresAt: true,
      refreshTokenEncrypted: true,
      refreshTokenExpiresAt: true,
    },
  });

  if (!row) throw new Error("CJdropshipping integration was not found");

  if (row.accessTokenEncrypted && validBeyondRefreshBuffer(row.accessTokenExpiresAt)) {
    return decryptCjDropshippingSecret(row.accessTokenEncrypted);
  }

  try {
    const refreshed = await refreshWithStoredToken(row, client);
    if (refreshed) return refreshed;
  } catch (error) {
    console.warn("[cjdropshipping-auth] refresh token failed; reauthorizing", {
      integrationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return reauthorizeWithStoredApiKey(row, client);
}
