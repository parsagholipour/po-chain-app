import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { runIfPrismaAvailable } from "@/lib/prisma-unavailable";

const APP_SESSION_TTL_DAYS = 30;

export type AppSessionRow = {
  id: string;
  userId: string;
  keycloakSub: string;
  keycloakSessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type AppSessionTouchResult = "active" | "revoked" | "unavailable";

function activeCutoff() {
  return new Date(Date.now() - APP_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function truncate(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export async function touchKeycloakAppSession(input: {
  id: string;
  userId: string;
  keycloakSub: string;
  keycloakSessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<AppSessionTouchResult> {
  const result = await runIfPrismaAvailable(async () => {
    const now = new Date();
    const cutoff = activeCutoff();
    const existingRows = await prisma.$queryRaw<
      Pick<AppSessionRow, "userId" | "revokedAt" | "lastSeenAt">[]
    >`
      SELECT "userId", "revokedAt", "lastSeenAt"
      FROM "AppSession"
      WHERE "id" = ${input.id}::uuid
      LIMIT 1
    `;
    const existing = existingRows[0];

    if (existing) {
      if (existing.userId !== input.userId || existing.revokedAt || existing.lastSeenAt < cutoff) {
        if (!existing.revokedAt) {
          await prisma.$executeRaw`
            UPDATE "AppSession"
            SET "revokedAt" = ${now}
            WHERE "id" = ${input.id}::uuid AND "revokedAt" IS NULL
          `;
        }
        return "revoked" as const;
      }

      await prisma.$executeRaw`
        UPDATE "AppSession"
        SET
          "keycloakSub" = ${input.keycloakSub}::uuid,
          "keycloakSessionId" = ${input.keycloakSessionId},
          "ipAddress" = ${truncate(input.ipAddress, 128)},
          "userAgent" = ${truncate(input.userAgent, 512)},
          "lastSeenAt" = ${now}
        WHERE "id" = ${input.id}::uuid
      `;
      return "active" as const;
    }

    await prisma.$executeRaw`
      INSERT INTO "AppSession" (
        "id",
        "userId",
        "keycloakSub",
        "keycloakSessionId",
        "ipAddress",
        "userAgent",
        "lastSeenAt"
      )
      VALUES (
        ${input.id}::uuid,
        ${input.userId}::uuid,
        ${input.keycloakSub}::uuid,
        ${input.keycloakSessionId},
        ${truncate(input.ipAddress, 128)},
        ${truncate(input.userAgent, 512)},
        ${now}
      )
    `;
    return "active" as const;
  });

  return result.ok ? result.value : "unavailable";
}

export async function listActiveAppSessionsForUser(userId: string) {
  return prisma.$queryRaw<AppSessionRow[]>`
    SELECT
      "id",
      "userId",
      "keycloakSub",
      "keycloakSessionId",
      "ipAddress",
      "userAgent",
      "createdAt",
      "lastSeenAt",
      "revokedAt"
    FROM "AppSession"
    WHERE
      "userId" = ${userId}::uuid
      AND "revokedAt" IS NULL
      AND "lastSeenAt" >= ${activeCutoff()}
    ORDER BY "lastSeenAt" DESC
  `;
}

export async function revokeOtherAppSessions(input: {
  userId: string;
  currentAppSessionId: string;
}) {
  const now = new Date();
  return prisma.$queryRaw<Pick<AppSessionRow, "id" | "keycloakSessionId">[]>`
    UPDATE "AppSession"
    SET "revokedAt" = ${now}
    WHERE
      "userId" = ${input.userId}::uuid
      AND "id" <> ${input.currentAppSessionId}::uuid
      AND "revokedAt" IS NULL
      AND "lastSeenAt" >= ${activeCutoff()}
    RETURNING "id", "keycloakSessionId"
  `;
}

export async function revokeAppSession(id: string) {
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "AppSession"
      SET "revokedAt" = ${new Date()}
      WHERE "id" = ${id}::uuid AND "revokedAt" IS NULL
    `,
  );
}
