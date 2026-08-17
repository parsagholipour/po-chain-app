import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { crmIntegrationUpdateSchema } from "@/lib/validations/crm-integration";
import { CrmApiError, CrmClient } from "@/lib/crm/client";
import {
  assertCrmApiToken,
  assertCrmWebhookSecret,
  displayCrmLeadsWebhookUrl,
  normalizeCrmBaseUrl,
} from "@/lib/crm/domain";
import { decryptCrmSecret, encryptCrmSecret } from "@/lib/crm/encryption";
import { syncCrmIntegrationForStore } from "@/lib/crm/sync";

export const runtime = "nodejs";

function webhookRegistrationIsRequired() {
  return process.env.NODE_ENV === "production";
}

function integrationResponse(row: {
  id: string;
  baseUrl: string;
  enabled: boolean;
  apiTokenEncrypted: string | null;
  webhookSecretEncrypted: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncedLeadCount: number;
  updatedAt: Date;
} | null) {
  if (!row) {
    return {
      id: null,
      baseUrl: "",
      enabled: false,
      hasApiToken: false,
      hasWebhookSecret: false,
      organizationId: null,
      organizationName: null,
      organizationSlug: null,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      lastSyncedLeadCount: 0,
      webhookUrl: null,
      updatedAt: null,
    };
  }

  return {
    id: row.id,
    baseUrl: row.baseUrl,
    enabled: row.enabled,
    hasApiToken: row.apiTokenEncrypted != null,
    hasWebhookSecret: row.webhookSecretEncrypted != null,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    organizationSlug: row.organizationSlug,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row.lastSyncStatus,
    lastSyncError: row.lastSyncError,
    lastSyncedLeadCount: row.lastSyncedLeadCount,
    webhookUrl: displayCrmLeadsWebhookUrl(row.id),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function encryptedSecretForSave(input: {
  nextPlaintext?: string;
  existingEncrypted: string | null | undefined;
}) {
  if (input.nextPlaintext) {
    return encryptCrmSecret(input.nextPlaintext);
  }
  return input.existingEncrypted ?? null;
}

export async function GET() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const row = await prisma.crmIntegration.findUnique({
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

  const parsed = crmIntegrationUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const existing = await prisma.crmIntegration.findUnique({
      where: { storeId },
    });

    const nextBaseUrl = normalizeCrmBaseUrl(parsed.data.baseUrl);
    if (parsed.data.apiToken) assertCrmApiToken(parsed.data.apiToken);
    if (parsed.data.webhookSecret) assertCrmWebhookSecret(parsed.data.webhookSecret);

    const nextApiTokenEncrypted = await encryptedSecretForSave({
      nextPlaintext: parsed.data.apiToken,
      existingEncrypted: existing?.apiTokenEncrypted,
    });
    const nextWebhookSecretEncrypted = await encryptedSecretForSave({
      nextPlaintext: parsed.data.webhookSecret,
      existingEncrypted: existing?.webhookSecretEncrypted,
    });

    const effectiveApiToken =
      parsed.data.apiToken ??
      (existing?.apiTokenEncrypted
        ? await decryptCrmSecret(existing.apiTokenEncrypted)
        : null);

    const saved = await prisma.crmIntegration.upsert({
      where: { storeId },
      create: {
        storeId,
        baseUrl: nextBaseUrl,
        enabled: false,
        apiTokenEncrypted: nextApiTokenEncrypted,
        webhookSecretEncrypted: nextWebhookSecretEncrypted,
      },
      update: {
        baseUrl: nextBaseUrl,
        enabled: false,
        apiTokenEncrypted: nextApiTokenEncrypted,
        webhookSecretEncrypted: nextWebhookSecretEncrypted,
      },
    });

    if (!parsed.data.enabled) {
      const disabled = await prisma.crmIntegration.update({
        where: { id: saved.id },
        data: {
          enabled: false,
          lastSyncError: null,
        },
      });
      return NextResponse.json(integrationResponse(disabled));
    }

    if (!effectiveApiToken) {
      return jsonError("CRM API token is required before enabling", 400);
    }
    if (webhookRegistrationIsRequired() && !nextWebhookSecretEncrypted) {
      return jsonError("Webhook signing secret is required before enabling", 400);
    }

    const organization = await CrmClient.fromIntegration(nextBaseUrl, effectiveApiToken).me();
    const enabled = await prisma.crmIntegration.update({
      where: { id: saved.id },
      data: {
        enabled: true,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        lastSyncError: null,
      },
    });

    after(() =>
      syncCrmIntegrationForStore(storeId, "manual", { mode: "full" }).catch((error) => {
        console.error("[crm-sync] initial sync after enable failed", storeId, error);
      }),
    );

    return NextResponse.json(integrationResponse(enabled));
  } catch (error) {
    const j = jsonFromPrisma(error);
    if (j) return j;
    if (error instanceof CrmApiError) {
      if (error.status === 401 || error.code === "UNAUTHENTICATED") {
        return jsonError(
          "CRM rejected the API token. Create a new token in Setup → API Access.",
          400,
        );
      }
      return jsonError(error.message, 400);
    }
    if (error instanceof Error) {
      return jsonError(error.message, 400);
    }
    throw error;
  }
}
