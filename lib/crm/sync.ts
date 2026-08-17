import "server-only";

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { CrmClient } from "@/lib/crm/client";
import { decryptCrmSecret } from "@/lib/crm/encryption";
import { markUnseenCrmLeadsDeleted, upsertCrmLead } from "@/lib/crm/upsert";
import type { CrmSyncTrigger } from "@/lib/crm/lead";

const SYNC_LOCK_MS = 10 * 60 * 1000;
const OVERLAP_MS = 60_000;

export type CrmSyncResult = {
  integrationId: string;
  skipped: boolean;
  reason?: string;
  lockExpiresAt?: string | null;
  mode: "full" | "incremental";
  syncedLeadCount: number;
  deletedLeadCount: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function elapsedMs(startedAt: number) {
  return Date.now() - startedAt;
}

function lockReason(lockUntil: Date | null) {
  return lockUntil
    ? `A CRM lead sync is already running until ${lockUntil.toISOString()}`
    : "A CRM lead sync is already running";
}

function emptySyncResult(
  integrationId: string,
  overrides: Partial<CrmSyncResult> = {},
): CrmSyncResult {
  return {
    integrationId,
    skipped: true,
    mode: "full",
    syncedLeadCount: 0,
    deletedLeadCount: 0,
    ...overrides,
  };
}

async function acquireSyncLock(integrationId: string) {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + SYNC_LOCK_MS);
  const updated = await prisma.crmIntegration.updateMany({
    where: {
      id: integrationId,
      OR: [{ syncLockUntil: null }, { syncLockUntil: { lt: now } }],
    },
    data: { syncLockUntil: lockUntil },
  });

  if (updated.count === 1) {
    return { status: "acquired" as const, lockUntil };
  }

  const current = await prisma.crmIntegration.findUnique({
    where: { id: integrationId },
    select: {
      syncLockUntil: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      updatedAt: true,
    },
  });

  if (!current) return { status: "missing" as const };

  return {
    status: "locked" as const,
    lockUntil: current.syncLockUntil,
    lastSyncAt: current.lastSyncAt,
    lastSyncStatus: current.lastSyncStatus,
    updatedAt: current.updatedAt,
  };
}

async function markSyncError(integrationId: string, error: unknown) {
  await prisma.crmIntegration.update({
    where: { id: integrationId },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: "error",
      lastSyncError: errorMessage(error).slice(0, 4000),
      syncLockUntil: null,
    },
  });
}

async function syncLeadsFromClient(input: {
  storeId: string;
  integrationId: string;
  client: CrmClient;
  trigger: CrmSyncTrigger;
  updatedSince?: string;
  markMissingDeleted: boolean;
}) {
  const syncRunId = randomUUID();
  const startedAt = new Date();
  let syncedLeadCount = 0;

  for await (const lead of input.client.iterateLeads({
    limit: 100,
    updatedSince: input.updatedSince,
  })) {
    await upsertCrmLead({
      storeId: input.storeId,
      integrationId: input.integrationId,
      lead,
      trigger: input.trigger,
      syncRunId,
      now: startedAt,
    });
    syncedLeadCount += 1;
  }

  const deletedLeadCount = input.markMissingDeleted
    ? await markUnseenCrmLeadsDeleted({
        storeId: input.storeId,
        syncRunId,
        trigger: input.trigger,
        deletedAt: startedAt,
      })
    : 0;

  return { syncedLeadCount, deletedLeadCount, startedAt };
}

export async function syncCrmIntegrationById(
  integrationId: string,
  trigger: CrmSyncTrigger,
  options: { mode?: "full" | "incremental" } = {},
): Promise<CrmSyncResult> {
  const startedAt = Date.now();
  console.info("[crm-sync] sync requested", { integrationId, trigger });

  const lock = await acquireSyncLock(integrationId);
  if (lock.status === "missing") {
    return emptySyncResult(integrationId, { reason: "CRM integration was not found" });
  }

  if (lock.status === "locked") {
    console.warn("[crm-sync] sync skipped; lock is still active", {
      integrationId,
      trigger,
      lockUntil: lock.lockUntil?.toISOString() ?? null,
      durationMs: elapsedMs(startedAt),
    });
    return emptySyncResult(integrationId, {
      reason: lockReason(lock.lockUntil),
      lockExpiresAt: lock.lockUntil?.toISOString() ?? null,
    });
  }

  try {
    const integration = await prisma.crmIntegration.findUnique({
      where: { id: integrationId },
      select: {
        id: true,
        storeId: true,
        baseUrl: true,
        enabled: true,
        apiTokenEncrypted: true,
        lastIncrementalAt: true,
      },
    });

    if (!integration) {
      return emptySyncResult(integrationId, { reason: "CRM integration was not found" });
    }

    if (!integration.enabled) {
      await prisma.crmIntegration.update({
        where: { id: integration.id },
        data: { syncLockUntil: null },
      });
      return emptySyncResult(integrationId, { reason: "CRM integration is disabled" });
    }

    if (!integration.apiTokenEncrypted) {
      throw new Error("CRM API token is not configured");
    }

    const mode: "full" | "incremental" =
      options.mode ??
      (trigger === "scheduled" && integration.lastIncrementalAt ? "incremental" : "full");

    const token = await decryptCrmSecret(integration.apiTokenEncrypted);
    const client = CrmClient.fromIntegration(integration.baseUrl, token);
    const updatedSince =
      mode === "incremental" && integration.lastIncrementalAt
        ? new Date(integration.lastIncrementalAt.getTime() - OVERLAP_MS).toISOString()
        : undefined;

    const result = await syncLeadsFromClient({
      storeId: integration.storeId,
      integrationId: integration.id,
      client,
      trigger,
      updatedSince,
      markMissingDeleted: mode === "full",
    });

    const totalLeads = await prisma.crmLead.count({
      where: { storeId: integration.storeId, deletedAt: null },
    });

    await prisma.crmIntegration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: trigger,
        lastSyncError: null,
        lastSyncedLeadCount: totalLeads,
        lastIncrementalAt: result.startedAt,
        syncLockUntil: null,
      },
    });

    console.info("[crm-sync] sync completed", {
      integrationId,
      storeId: integration.storeId,
      trigger,
      mode,
      syncedLeadCount: result.syncedLeadCount,
      deletedLeadCount: result.deletedLeadCount,
      durationMs: elapsedMs(startedAt),
    });

    return {
      integrationId,
      skipped: false,
      mode,
      syncedLeadCount: result.syncedLeadCount,
      deletedLeadCount: result.deletedLeadCount,
    };
  } catch (error) {
    console.error("[crm-sync] sync failed", {
      integrationId,
      trigger,
      durationMs: elapsedMs(startedAt),
      error: errorMessage(error),
    });
    await markSyncError(integrationId, error);
    throw error;
  }
}

export async function syncCrmIntegrationForStore(
  storeId: string,
  trigger: CrmSyncTrigger,
  options: { mode?: "full" | "incremental" } = {},
) {
  const integration = await prisma.crmIntegration.findUnique({
    where: { storeId },
    select: { id: true },
  });
  if (!integration) {
    return emptySyncResult("", { reason: "CRM integration is not configured" });
  }
  return syncCrmIntegrationById(integration.id, trigger, options);
}

export async function syncAllEnabledCrmIntegrations() {
  const rows = await prisma.crmIntegration.findMany({
    where: {
      enabled: true,
      apiTokenEncrypted: { not: null },
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
  });

  const results: Array<CrmSyncResult | { integrationId: string; skipped: false; error: string }> =
    [];

  for (const row of rows) {
    try {
      results.push(await syncCrmIntegrationById(row.id, "scheduled"));
    } catch (error) {
      console.error("[crm-sync] scheduled sync failed", row.id, error);
      results.push({
        integrationId: row.id,
        skipped: false,
        error: errorMessage(error),
      });
    }
  }

  return results;
}
