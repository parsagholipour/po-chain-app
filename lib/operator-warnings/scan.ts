import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  findingWithFingerprint,
  OPERATOR_WARNING_CHECK_BY_TYPE,
  OPERATOR_WARNING_CHECKS,
} from "@/lib/operator-warnings/checks";
import type { WarningFinding } from "@/lib/operator-warnings/finding";
import { operatorWarningInclude, serializeOperatorWarning } from "@/lib/operator-warnings/serialize";
import type { OperatorWarningRow } from "@/lib/types/api";

const SCAN_LOCK_MS = 10 * 60 * 1000;
/** Rows per INSERT ... ON CONFLICT. Chunks run sequentially so the scan uses one pooled connection. */
const UPSERT_CHUNK_SIZE = 200;

type FingerprintedFinding = WarningFinding & { fingerprint: string };

export type WarningScanResult = {
  skipped: boolean;
  reason?: string;
  lockExpiresAt?: string | null;
  lastStatus: string | null;
  lastFinishedAt: string | null;
  lastOpenCount: number;
  lastError: string | null;
};

export type WarningRowResyncResult = {
  deleted: boolean;
  warning: OperatorWarningRow | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function lockReason(lockUntil: Date | null) {
  return lockUntil
    ? `A warnings scan is already running until ${lockUntil.toISOString()}`
    : "A warnings scan is already running";
}

type ScanStateFields = {
  lockUntil: Date | null;
  lastStatus: string | null;
  lastFinishedAt: Date | null;
  lastOpenCount: number;
  lastError: string | null;
};

function lockedScanState(state: ScanStateFields | null, fallbackLockUntil?: Date) {
  return {
    status: "locked" as const,
    lockUntil: state?.lockUntil ?? fallbackLockUntil ?? null,
    lastStatus: state?.lastStatus ?? "running",
    lastFinishedAt: state?.lastFinishedAt ?? null,
    lastOpenCount: state?.lastOpenCount ?? 0,
    lastError: state?.lastError ?? null,
  };
}

async function acquireScanLock(storeId: string) {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + SCAN_LOCK_MS);

  const updated = await prisma.operatorWarningScanState.updateMany({
    where: {
      storeId,
      OR: [{ lockUntil: null }, { lockUntil: { lt: now } }],
    },
    data: {
      lastStartedAt: now,
      lastStatus: "running",
      lastError: null,
      lockUntil,
    },
  });

  if (updated.count === 1) {
    return { status: "acquired" as const, lockUntil };
  }

  const current = await prisma.operatorWarningScanState.findUnique({
    where: { storeId },
  });

  if (!current) {
    try {
      await prisma.operatorWarningScanState.create({
        data: {
          storeId,
          lastStartedAt: now,
          lastStatus: "running",
          lastError: null,
          lockUntil,
        },
      });
      return { status: "acquired" as const, lockUntil };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await prisma.operatorWarningScanState.findUnique({
          where: { storeId },
        });
        return lockedScanState(raced, lockUntil);
      }
      throw error;
    }
  }

  return lockedScanState(current);
}

async function finishScan(
  storeId: string,
  data: {
    lastStatus: string;
    lastError: string | null;
    lastOpenCount: number;
  },
): Promise<WarningScanResult> {
  const lastFinishedAt = new Date();
  await prisma.operatorWarningScanState.update({
    where: { storeId },
    data: {
      lastFinishedAt,
      lastStatus: data.lastStatus,
      lastError: data.lastError,
      lastOpenCount: data.lastOpenCount,
      lockUntil: null,
    },
  });
  return {
    skipped: false,
    lastStatus: data.lastStatus,
    lastFinishedAt: lastFinishedAt.toISOString(),
    lastOpenCount: data.lastOpenCount,
    lastError: data.lastError,
  };
}

function upsertFindingValues(storeId: string, findings: FingerprintedFinding[], now: Date) {
  return Prisma.join(
    findings.map(
      (finding) => Prisma.sql`(
        ${randomUUID()}::uuid,
        ${finding.fingerprint},
        CAST(${finding.type} AS "OperatorWarningType"),
        CAST(${finding.tier} AS "OperatorWarningTier"),
        ${finding.entityType},
        ${finding.entityId},
        ${finding.title},
        ${finding.message},
        ${finding.href},
        true,
        ${now},
        ${now},
        ${storeId}::uuid,
        ${now}
      )`,
    ),
  );
}

async function upsertFindings(storeId: string, findings: FingerprintedFinding[], now: Date) {
  for (let index = 0; index < findings.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = findings.slice(index, index + UPSERT_CHUNK_SIZE);
    await prisma.$executeRaw`
      INSERT INTO "OperatorWarning" (
        "id",
        "fingerprint",
        "type",
        "tier",
        "entityType",
        "entityId",
        "title",
        "message",
        "href",
        "issuePresent",
        "lastCheckedAt",
        "lastSeenAt",
        "storeId",
        "updatedAt"
      )
      VALUES ${upsertFindingValues(storeId, chunk, now)}
      ON CONFLICT ("storeId", "fingerprint") DO UPDATE SET
        "title" = EXCLUDED."title",
        "message" = EXCLUDED."message",
        "href" = EXCLUDED."href",
        "tier" = EXCLUDED."tier",
        "issuePresent" = true,
        "lastCheckedAt" = EXCLUDED."lastCheckedAt",
        "lastSeenAt" = EXCLUDED."lastSeenAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
  }
}

async function reconcileCheck(storeId: string, checkType: (typeof OPERATOR_WARNING_CHECKS)[number]["type"]) {
  const check = OPERATOR_WARNING_CHECK_BY_TYPE[checkType];
  const now = new Date();
  const findings = (await check.scan(storeId)).map(findingWithFingerprint);

  await upsertFindings(storeId, findings, now);

  await prisma.operatorWarning.deleteMany({
    where: { storeId, type: checkType, status: "open", lastCheckedAt: { lt: now } },
  });

  await prisma.operatorWarning.updateMany({
    where: {
      storeId,
      type: checkType,
      status: "disregarded",
      lastCheckedAt: { lt: now },
    },
    data: { issuePresent: false, lastCheckedAt: now },
  });
}

export async function scanStoreWarnings(storeId: string): Promise<WarningScanResult> {
  const lock = await acquireScanLock(storeId);
  if (lock.status === "locked") {
    return {
      skipped: true,
      reason: lockReason(lock.lockUntil),
      lockExpiresAt: lock.lockUntil?.toISOString() ?? null,
      lastStatus: lock.lastStatus,
      lastFinishedAt: lock.lastFinishedAt?.toISOString() ?? null,
      lastOpenCount: lock.lastOpenCount,
      lastError: lock.lastError,
    };
  }

  try {
    for (const check of OPERATOR_WARNING_CHECKS) {
      await reconcileCheck(storeId, check.type);
    }

    const lastOpenCount = await prisma.operatorWarning.count({
      where: { storeId, status: "open" },
    });
    return await finishScan(storeId, {
      lastStatus: "success",
      lastError: null,
      lastOpenCount,
    });
  } catch (error) {
    const lastOpenCount = await prisma.operatorWarning.count({
      where: { storeId, status: "open" },
    });
    await finishScan(storeId, {
      lastStatus: "error",
      lastError: errorMessage(error).slice(0, 4000),
      lastOpenCount,
    });
    throw error;
  }
}

export async function scanAllStores() {
  const stores = await prisma.store.findMany({ select: { id: true } });
  for (const store of stores) {
    try {
      const result = await scanStoreWarnings(store.id);
      if (result.skipped) {
        console.info("[operator-warnings] scan skipped", {
          storeId: store.id,
          reason: result.reason,
        });
      }
    } catch (error) {
      console.error("[operator-warnings] store scan failed", {
        storeId: store.id,
        error,
      });
    }
  }
}

export async function resyncOperatorWarningRow(
  storeId: string,
  warningId: string,
): Promise<WarningRowResyncResult | null> {
  const existing = await prisma.operatorWarning.findFirst({
    where: { id: warningId, storeId },
    include: operatorWarningInclude,
  });
  if (!existing) return null;

  const check = OPERATOR_WARNING_CHECK_BY_TYPE[existing.type];
  const finding = await check.evaluate(storeId, existing.entityId);
  const now = new Date();

  if (finding) {
    const updated = await prisma.operatorWarning.update({
      where: { id: existing.id },
      data: {
        title: finding.title,
        message: finding.message,
        href: finding.href,
        tier: finding.tier,
        issuePresent: true,
        lastCheckedAt: now,
        lastSeenAt: now,
      },
      include: operatorWarningInclude,
    });
    return { deleted: false, warning: serializeOperatorWarning(updated) };
  }

  if (existing.status === "open") {
    await prisma.operatorWarning.delete({ where: { id: existing.id } });
    return { deleted: true, warning: null };
  }

  const updated = await prisma.operatorWarning.update({
    where: { id: existing.id },
    data: { issuePresent: false, lastCheckedAt: now },
    include: operatorWarningInclude,
  });
  return { deleted: false, warning: serializeOperatorWarning(updated) };
}
