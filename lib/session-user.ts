import type { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/json-error";

/** Resolves the Prisma `User.id` for the current session, or `null`. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Ensures the session id refers to a real `User` row (avoids opaque Prisma P2003 on `createdById`).
 */
export async function requireAppUserId(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const userId = await getSessionUserId();
  if (!userId) {
    return { ok: false, response: jsonError("Unauthorized", 401) };
  }
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!row) {
    console.error(
      "[session] Session user id has no matching User row (sign in again to refresh JWT). id=",
      userId,
    );
    return {
      ok: false,
      response: jsonError(
        "Your account is not synced to the database. Sign out and sign in again.",
        403,
      ),
    };
  }
  return { ok: true, userId };
}
