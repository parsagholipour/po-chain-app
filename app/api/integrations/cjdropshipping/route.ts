import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { cjDropshippingIntegrationUpdateSchema } from "@/lib/validations/cjdropshipping-integration";
import {
  CjDropshippingApiError,
  CjDropshippingClient,
} from "@/lib/cjdropshipping/api";
import {
  encryptedCjApiKeyAndTokenData,
  ensureCjAccessToken,
} from "@/lib/cjdropshipping/auth";

export const runtime = "nodejs";

function integrationResponse(row: {
  id: string;
  enabled: boolean;
  apiKeyEncrypted: string | null;
  openId: string | null;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenEncrypted: string | null;
  refreshTokenExpiresAt: Date | null;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncedSkuCount: number;
  lastMatchedSkuCount: number;
  lastUnmatchedCjSkuCount: number;
  lastUnmatchedLocalSkuCount: number;
  lastSyncedProductCount: number;
  lastSyncedInventoryCount: number;
  lastMovementCount: number;
  updatedAt: Date;
} | null) {
  if (!row) {
    return {
      id: null,
      enabled: false,
      hasApiKey: false,
      hasAccessToken: false,
      hasRefreshToken: false,
      openId: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      lastSyncedSkuCount: 0,
      lastMatchedSkuCount: 0,
      lastUnmatchedCjSkuCount: 0,
      lastUnmatchedLocalSkuCount: 0,
      lastSyncedProductCount: 0,
      lastSyncedInventoryCount: 0,
      lastMovementCount: 0,
      updatedAt: null,
    };
  }

  return {
    id: row.id,
    enabled: row.enabled,
    hasApiKey: row.apiKeyEncrypted != null,
    hasAccessToken: row.accessTokenEncrypted != null,
    hasRefreshToken: row.refreshTokenEncrypted != null,
    openId: row.openId,
    accessTokenExpiresAt: row.accessTokenExpiresAt?.toISOString() ?? null,
    refreshTokenExpiresAt: row.refreshTokenExpiresAt?.toISOString() ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row.lastSyncStatus,
    lastSyncError: row.lastSyncError,
    lastSyncedSkuCount: row.lastSyncedSkuCount,
    lastMatchedSkuCount: row.lastMatchedSkuCount,
    lastUnmatchedCjSkuCount: row.lastUnmatchedCjSkuCount,
    lastUnmatchedLocalSkuCount: row.lastUnmatchedLocalSkuCount,
    lastSyncedProductCount: row.lastSyncedProductCount,
    lastSyncedInventoryCount: row.lastSyncedInventoryCount,
    lastMovementCount: row.lastMovementCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const row = await prisma.cjDropshippingIntegration.findUnique({
    where: { storeId },
  });
  return NextResponse.json(integrationResponse(row));
}

export async function PATCH(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = cjDropshippingIntegrationUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const existing = await prisma.cjDropshippingIntegration.findUnique({
      where: { storeId },
    });

    const client = new CjDropshippingClient({ requestIntervalMs: 0 });
    const secretData = parsed.data.apiKey
      ? await encryptedCjApiKeyAndTokenData(
          parsed.data.apiKey,
          await client.authenticateWithApiKey(parsed.data.apiKey),
        )
      : {};

    if (parsed.data.enabled && !parsed.data.apiKey && !existing?.apiKeyEncrypted) {
      return jsonError("CJdropshipping API key is required before enabling", 400);
    }

    const saved = await prisma.cjDropshippingIntegration.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: false,
        ...secretData,
      },
      update: {
        ...secretData,
      },
    });

    if (!parsed.data.enabled) {
      const disabled = await prisma.cjDropshippingIntegration.update({
        where: { id: saved.id },
        data: {
          enabled: false,
          lastSyncError: null,
        },
      });
      return NextResponse.json(integrationResponse(disabled));
    }

    await ensureCjAccessToken(saved.id, client);
    const enabled = await prisma.cjDropshippingIntegration.update({
      where: { id: saved.id },
      data: {
        enabled: true,
        lastSyncError: null,
      },
    });

    return NextResponse.json(integrationResponse(enabled));
  } catch (error) {
    const j = jsonFromPrisma(error);
    if (j) return j;
    if (error instanceof CjDropshippingApiError || error instanceof Error) {
      return jsonError(error.message, 400);
    }
    throw error;
  }
}
