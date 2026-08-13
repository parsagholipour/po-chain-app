import type { OperatorWarning, User } from "@/app/generated/prisma/client";
import type { OperatorWarningRow, OperatorWarningScanStateRow } from "@/lib/types/api";

type WarningWithDisregardedBy = OperatorWarning & {
  disregardedBy: Pick<User, "id" | "name" | "email"> | null;
};

export function serializeOperatorWarning(row: WarningWithDisregardedBy): OperatorWarningRow {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    type: row.type,
    tier: row.tier,
    status: row.status,
    entityType: row.entityType,
    entityId: row.entityId,
    title: row.title,
    message: row.message,
    href: row.href,
    issuePresent: row.issuePresent,
    lastCheckedAt: row.lastCheckedAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    disregardedAt: row.disregardedAt?.toISOString() ?? null,
    disregardReason: row.disregardReason,
    disregardedBy: row.disregardedBy
      ? {
          id: row.disregardedBy.id,
          name: row.disregardedBy.name,
          email: row.disregardedBy.email,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeWarningScanState(row: {
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  lastOpenCount: number;
  lockUntil: Date | null;
} | null): OperatorWarningScanStateRow | null {
  if (!row) return null;
  return {
    lastStartedAt: row.lastStartedAt?.toISOString() ?? null,
    lastFinishedAt: row.lastFinishedAt?.toISOString() ?? null,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    lastOpenCount: row.lastOpenCount,
    lockUntil: row.lockUntil?.toISOString() ?? null,
  };
}

export const operatorWarningInclude = {
  disregardedBy: { select: { id: true, name: true, email: true } },
} as const;
