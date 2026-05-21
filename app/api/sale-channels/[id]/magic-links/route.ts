import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import {
  ensureStoreSaleChannelLoginUser,
  generateMagicLinkToken,
  hashMagicLinkToken,
  STORE_MAGIC_LINK_TTL_DAYS,
  storeMagicLinkUrl,
} from "@/lib/sale-channel-magic-links";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

function appOrigin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    new URL(request.url).origin
  ).replace(/\/$/, "");
}

function magicLinkResponse(row: {
  id: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  useCount: number;
  createdAt: Date;
}) {
  const now = new Date();
  return {
    id: row.id,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
    useCount: row.useCount,
    createdAt: row.createdAt,
    active: !row.revokedAt && row.expiresAt > now,
  };
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const saleChannel = await prisma.saleChannel.findFirst({
    where: { id: pid.data.id, storeId, type: "store" },
    select: { id: true },
  });
  if (!saleChannel) return jsonError("Store sale channel not found", 404);

  const rows = await prisma.saleChannelMagicLink.findMany({
    where: { saleChannelId: pid.data.id, storeId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      useCount: true,
      createdAt: true,
    },
  });
  return NextResponse.json(rows.map(magicLinkResponse));
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const token = generateMagicLinkToken();
  const tokenHash = hashMagicLinkToken(token);
  const expiresAt = new Date(Date.now() + STORE_MAGIC_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const saleChannel = await tx.saleChannel.findFirst({
        where: { id: pid.data.id, storeId, type: "store" },
        select: { id: true, name: true, email: true, storeId: true },
      });
      if (!saleChannel) throw new Error("STORE_SALE_CHANNEL_NOT_FOUND");

      await ensureStoreSaleChannelLoginUser(tx, {
        saleChannelId: saleChannel.id,
        storeId: saleChannel.storeId,
        name: saleChannel.name,
        email: saleChannel.email,
      });

      return tx.saleChannelMagicLink.create({
        data: {
          tokenHash,
          expiresAt,
          saleChannelId: saleChannel.id,
          storeId,
          createdById: userId,
        },
        select: {
          id: true,
          expiresAt: true,
          revokedAt: true,
          lastUsedAt: true,
          useCount: true,
          createdAt: true,
        },
      });
    });

    return NextResponse.json(
      {
        ...magicLinkResponse(row),
        url: storeMagicLinkUrl(appOrigin(request), token),
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof Error && e.message === "STORE_SALE_CHANNEL_NOT_FOUND") {
      return jsonError("Store sale channel not found", 404);
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
