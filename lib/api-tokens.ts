import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ApiTokenScope } from "@/lib/developer-api-constants";

/** Prefix keeps tokens greppable in logs and secret scanners. */
export const API_TOKEN_PREFIX = "poa";
const API_TOKEN_BYTES = 32;

/** Writing lastUsedAt on every request would double the write load of a read API. */
const LAST_USED_REFRESH_MS = 60_000;

export type ApiTokenContext = {
  tokenId: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  scopes: string[];
};

function readIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function generateApiToken() {
  const secret = randomBytes(API_TOKEN_BYTES).toString("base64url");
  return `${API_TOKEN_PREFIX}_${secret}`;
}

export function hashApiToken(token: string) {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

/** Shown in the UI so a token can be recognised without revealing it. */
export function apiTokenDisplayParts(token: string) {
  const secret = token.slice(API_TOKEN_PREFIX.length + 1);
  return {
    tokenPrefix: `${API_TOKEN_PREFIX}_${secret.slice(0, 6)}`,
    last4: secret.slice(-4),
  };
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim();
  if (!header) return null;
  const [scheme, ...rest] = header.split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer") return null;
  const value = rest.join("");
  return value.length > 0 ? value : null;
}

// In-process sliding window. Good enough for a single-node deployment; swap for
// a shared store if the app is ever scaled horizontally.
const RATE_LIMIT_WINDOW_MS = readIntEnv("PUBLIC_API_RATE_LIMIT_WINDOW_MS", 60_000);
const RATE_LIMIT_MAX = readIntEnv("PUBLIC_API_RATE_LIMIT_MAX", 120);

const globalForApiTokens = globalThis as typeof globalThis & {
  __publicApiRateLimitBuckets?: Map<string, number[]>;
};

const rateLimitBuckets =
  globalForApiTokens.__publicApiRateLimitBuckets ??
  (globalForApiTokens.__publicApiRateLimitBuckets = new Map<string, number[]>());

function checkRateLimit(tokenId: string) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (rateLimitBuckets.get(tokenId) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );

  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitBuckets.set(tokenId, recent);
    const oldest = recent[0] ?? now;
    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1_000),
      ),
      remaining: 0,
    };
  }

  recent.push(now);
  rateLimitBuckets.set(tokenId, recent);
  return {
    allowed: true as const,
    retryAfterSeconds: 0,
    remaining: Math.max(0, RATE_LIMIT_MAX - recent.length),
  };
}

function apiError(code: string, message: string, status: number, extra?: HeadersInit) {
  return NextResponse.json(
    { error: { code, message } },
    { status, ...(extra ? { headers: extra } : {}) },
  );
}

export type ApiTokenAuthResult =
  | { ok: true; context: ApiTokenContext }
  | { ok: false; response: NextResponse };

/**
 * Authenticates a public API request from `Authorization: Bearer <token>` and
 * checks that the token carries `scope`. Errors use the public API envelope
 * (`{ error: { code, message } }`) rather than the internal `{ message }` shape.
 */
export async function requireApiToken(
  request: Request,
  scope: ApiTokenScope,
): Promise<ApiTokenAuthResult> {
  const token = bearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: apiError(
        "unauthorized",
        "Missing bearer token. Send Authorization: Bearer <token>.",
        401,
        { "WWW-Authenticate": 'Bearer realm="po-app"' },
      ),
    };
  }

  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(token) },
    select: {
      id: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      storeId: true,
      store: { select: { name: true, slug: true } },
    },
  });

  if (!row || row.revokedAt) {
    return {
      ok: false,
      response: apiError("unauthorized", "Invalid API token.", 401),
    };
  }
  if (row.expiresAt && row.expiresAt <= new Date()) {
    return {
      ok: false,
      response: apiError("token_expired", "This API token has expired.", 401),
    };
  }
  if (!row.scopes.includes(scope)) {
    return {
      ok: false,
      response: apiError(
        "insufficient_scope",
        `This API token is missing the "${scope}" scope.`,
        403,
      ),
    };
  }

  const rateLimit = checkRateLimit(row.id);
  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: apiError("rate_limited", "Too many requests.", 429, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
        "RateLimit-Limit": String(RATE_LIMIT_MAX),
        "RateLimit-Remaining": "0",
      }),
    };
  }

  await touchApiToken(row.id, row.lastUsedAt);

  return {
    ok: true,
    context: {
      tokenId: row.id,
      storeId: row.storeId,
      storeName: row.store.name,
      storeSlug: row.store.slug,
      scopes: row.scopes,
    },
  };
}

async function touchApiToken(tokenId: string, lastUsedAt: Date | null) {
  const now = Date.now();
  if (lastUsedAt && now - lastUsedAt.getTime() < LAST_USED_REFRESH_MS) return;

  try {
    await prisma.apiToken.update({
      where: { id: tokenId },
      data: { lastUsedAt: new Date(now), requestCount: { increment: 1 } },
    });
  } catch (error) {
    // Usage bookkeeping must never fail an otherwise valid request.
    console.warn("[public-api] could not record API token usage", error);
  }
}

export function publicApiError(
  code: string,
  message: string,
  status: number,
  extra?: HeadersInit,
) {
  return apiError(code, message, status, extra);
}
