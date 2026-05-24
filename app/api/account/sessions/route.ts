import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import {
  deleteKeycloakSession,
  KeycloakAdminConfigError,
  KeycloakAdminError,
  listKeycloakUserSessions,
  type KeycloakUserSession,
} from "@/lib/keycloak-admin";
import {
  listActiveAppSessionsForUser,
  revokeAppSession,
  revokeOtherAppSessions,
  type AppSessionRow,
} from "@/lib/app-sessions";

export const runtime = "nodejs";

const postSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("logout-others"),
    })
    .strict(),
  z
    .object({
      action: z.literal("revoke"),
      sessionId: z.string().min(1).max(256),
    })
    .strict(),
]);

function serializeKeycloakSession(row: KeycloakUserSession, currentSessionId: string | null) {
  return {
    id: row.id,
    ipAddress: row.ipAddress,
    startedAt: row.startedAt?.toISOString() ?? null,
    lastAccessedAt: row.lastAccessedAt?.toISOString() ?? null,
    clients: row.clients,
    rememberMe: row.rememberMe,
    isCurrent: Boolean(currentSessionId && row.id === currentSessionId),
    userAgent: null,
    keycloakActive: true,
  };
}

function serializeAppSession(
  row: AppSessionRow,
  currentAppSessionId: string | null,
  keycloakSessionsById: Map<string, KeycloakUserSession>,
) {
  const keycloakSession = row.keycloakSessionId
    ? keycloakSessionsById.get(row.keycloakSessionId)
    : null;

  return {
    id: row.id,
    ipAddress: keycloakSession?.ipAddress ?? row.ipAddress,
    startedAt: row.createdAt.toISOString(),
    lastAccessedAt: row.lastSeenAt.toISOString(),
    clients: keycloakSession?.clients.length ? keycloakSession.clients : ["PO App"],
    rememberMe: keycloakSession?.rememberMe ?? false,
    isCurrent: Boolean(currentAppSessionId && row.id === currentAppSessionId),
    userAgent: row.userAgent,
    keycloakActive: Boolean(keycloakSession),
  };
}

function keycloakErrorResponse(e: unknown) {
  if (e instanceof KeycloakAdminConfigError) {
    return jsonError(e.message, 503);
  }
  if (e instanceof KeycloakAdminError) {
    return jsonError(e.message, 502);
  }
  const prismaError = jsonFromPrisma(e);
  if (prismaError) return prismaError;
  return null;
}

async function requireKeycloakSessionContext() {
  const session = await auth();
  if (session?.forceSignOut || !session?.user?.id) {
    return { ok: false as const, response: jsonError("Unauthorized", 401) };
  }
  if (session.authProvider !== "keycloak") {
    return {
      ok: false as const,
      response: jsonError("Session management is only available for Keycloak accounts", 403),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { keycloakSub: true },
  });
  if (!user) {
    return { ok: false as const, response: jsonError("Unauthorized", 401) };
  }

  return {
    ok: true as const,
    appUserId: session.user.id,
    keycloakUserId: user.keycloakSub,
    currentSessionId: session.keycloakSessionId ?? null,
    currentAppSessionId: session.appSessionId ?? null,
  };
}

async function safeListKeycloakSessions(keycloakUserId: string) {
  try {
    return await listKeycloakUserSessions(keycloakUserId);
  } catch (e) {
    if (e instanceof KeycloakAdminConfigError || e instanceof KeycloakAdminError) {
      console.warn("[account-sessions] Keycloak session lookup failed", e.message);
      return [];
    }
    throw e;
  }
}

async function revokeSingleSession(input: {
  appUserId: string;
  keycloakUserId: string;
  currentAppSessionId: string | null;
  currentKeycloakSessionId: string | null;
  targetSessionId: string;
}) {
  if (
    input.targetSessionId === input.currentAppSessionId ||
    input.targetSessionId === input.currentKeycloakSessionId
  ) {
    return { ok: false as const, response: jsonError("Cannot revoke the current session", 400) };
  }

  const [appSessions, keycloakSessions] = await Promise.all([
    listActiveAppSessionsForUser(input.appUserId),
    safeListKeycloakSessions(input.keycloakUserId),
  ]);
  const targetAppSession = appSessions.find((row) => row.id === input.targetSessionId);

  if (targetAppSession) {
    await revokeAppSession(targetAppSession.id);
    if (
      targetAppSession.keycloakSessionId &&
      targetAppSession.keycloakSessionId !== input.currentKeycloakSessionId
    ) {
      await deleteKeycloakSession(targetAppSession.keycloakSessionId);
    }
    return { ok: true as const, loggedOutCount: 1 };
  }

  const targetKeycloakSession = keycloakSessions.find(
    (row) => row.id === input.targetSessionId,
  );
  if (targetKeycloakSession) {
    await deleteKeycloakSession(targetKeycloakSession.id);
    return { ok: true as const, loggedOutCount: 1 };
  }

  return { ok: false as const, response: jsonError("Session not found", 404) };
}

export async function GET() {
  try {
    const context = await requireKeycloakSessionContext();
    if (!context.ok) return context.response;

    const [appSessions, keycloakSessions] = await Promise.all([
      listActiveAppSessionsForUser(context.appUserId),
      safeListKeycloakSessions(context.keycloakUserId),
    ]);
    const keycloakSessionsById = new Map(
      keycloakSessions.map((row) => [row.id, row] as const),
    );
    const appKeycloakSessionIds = new Set(
      appSessions
        .map((row) => row.keycloakSessionId)
        .filter((id): id is string => Boolean(id)),
    );
    const serializedAppSessions = appSessions.map((row) =>
      serializeAppSession(row, context.currentAppSessionId, keycloakSessionsById),
    );
    const serializedKeycloakOnlySessions = keycloakSessions
      .filter((row) => !appKeycloakSessionIds.has(row.id))
      .map((row) => serializeKeycloakSession(row, context.currentSessionId));

    return NextResponse.json([
      ...serializedAppSessions,
      ...serializedKeycloakOnlySessions,
    ]);
  } catch (e) {
    const response = keycloakErrorResponse(e);
    if (response) return response;
    throw e;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const context = await requireKeycloakSessionContext();
    if (!context.ok) return context.response;
    if (!context.currentAppSessionId) {
      return jsonError(
        "Current app session id is unavailable. Sign out and sign in again.",
        409,
      );
    }

    if (parsed.data.action === "revoke") {
      const result = await revokeSingleSession({
        appUserId: context.appUserId,
        keycloakUserId: context.keycloakUserId,
        currentAppSessionId: context.currentAppSessionId,
        currentKeycloakSessionId: context.currentSessionId,
        targetSessionId: parsed.data.sessionId,
      });
      if (!result.ok) return result.response;
      return NextResponse.json({ ok: true, loggedOutCount: result.loggedOutCount });
    }

    const [revokedAppSessions, keycloakSessions] = await Promise.all([
      revokeOtherAppSessions({
        userId: context.appUserId,
        currentAppSessionId: context.currentAppSessionId,
      }),
      safeListKeycloakSessions(context.keycloakUserId),
    ]);
    const revokedKeycloakSessionIds = new Set(
      revokedAppSessions
        .map((row) => row.keycloakSessionId)
        .filter((id): id is string => Boolean(id)),
    );
    const keycloakSessionsToDelete = keycloakSessions.filter(
      (row) =>
        row.id !== context.currentSessionId &&
        (context.currentSessionId ? true : revokedKeycloakSessionIds.has(row.id)),
    );
    await Promise.all(keycloakSessionsToDelete.map((row) => deleteKeycloakSession(row.id)));

    return NextResponse.json({
      ok: true,
      loggedOutCount: revokedAppSessions.length + keycloakSessionsToDelete.length,
    });
  } catch (e) {
    const response = keycloakErrorResponse(e);
    if (response) return response;
    throw e;
  }
}
