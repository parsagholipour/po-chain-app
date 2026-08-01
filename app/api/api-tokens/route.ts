import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  apiTokenDisplayParts,
  generateApiToken,
  hashApiToken,
} from "@/lib/api-tokens";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { apiTokenCreateSchema } from "@/lib/validations/developer-api";

export const runtime = "nodejs";

const tokenSelect = {
  id: true,
  name: true,
  tokenPrefix: true,
  last4: true,
  scopes: true,
  expiresAt: true,
  lastUsedAt: true,
  requestCount: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true, email: true, realEmail: true } },
};

type TokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  last4: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  requestCount: number;
  revokedAt: Date | null;
  createdAt: Date;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    realEmail: string | null;
  } | null;
};

function tokenResponse(row: TokenRow) {
  const expired = !!row.expiresAt && row.expiresAt <= new Date();
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    last4: row.last4,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    requestCount: row.requestCount,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    createdByName: row.createdBy?.realEmail ?? row.createdBy?.name ?? row.createdBy?.email ?? null,
    active: !row.revokedAt && !expired,
    expired,
  };
}

export async function GET() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const rows = await prisma.apiToken.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    select: tokenSelect,
  });
  return NextResponse.json(rows.map(tokenResponse));
}

export async function POST(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = apiTokenCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const token = generateApiToken();
  const { tokenPrefix, last4 } = apiTokenDisplayParts(token);
  const expiresInDays = parsed.data.expiresInDays ?? null;

  try {
    const row = await prisma.apiToken.create({
      data: {
        name: parsed.data.name,
        tokenHash: hashApiToken(token),
        tokenPrefix,
        last4,
        scopes: parsed.data.scopes,
        expiresAt: expiresInDays
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
          : null,
        storeId,
        createdById: userId,
      },
      select: tokenSelect,
    });

    // The plaintext token is returned exactly once and never persisted.
    return NextResponse.json({ ...tokenResponse(row), token }, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
