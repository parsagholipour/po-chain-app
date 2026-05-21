import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppUserAuthFields } from "@/lib/store";
import { findUserById } from "@/lib/store";

export const STORE_MAGIC_LINK_PROVIDER_ID = "store-magic-link";
export const STORE_MAGIC_LINK_TTL_DAYS = 7;
export const STORE_MAGIC_LINK_PATH_PREFIX = "/magic/store";

const STORE_LOGIN_EMAIL_DOMAIN = "po-app.local";

export function generateMagicLinkToken() {
  return randomBytes(32).toString("base64url");
}

export function hashMagicLinkToken(token: string) {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export function storeMagicLinkUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}${STORE_MAGIC_LINK_PATH_PREFIX}/${encodeURIComponent(token)}`;
}

async function availableStoreAppEmail(
  tx: Prisma.TransactionClient,
  saleChannelId: string,
  targetUserId?: string | null,
) {
  const aliases = [
    `store-${saleChannelId}@${STORE_LOGIN_EMAIL_DOMAIN}`,
    `store-${saleChannelId.slice(0, 8)}@${STORE_LOGIN_EMAIL_DOMAIN}`,
  ];

  for (const email of aliases) {
    const owner = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!owner || owner.id === targetUserId) return email;
  }

  return `${randomUUID()}@${STORE_LOGIN_EMAIL_DOMAIN}`;
}

export async function ensureStoreSaleChannelLoginUser(
  tx: Prisma.TransactionClient,
  {
    saleChannelId,
    storeId,
    name,
    email,
  }: {
    saleChannelId: string;
    storeId: string;
    name: string;
    email: string | null;
  },
) {
  const existing = await tx.user.findUnique({
    where: { saleChannelId },
    select: { id: true },
  });
  const appEmail = await availableStoreAppEmail(tx, saleChannelId, existing?.id);

  const user = existing
    ? await tx.user.update({
        where: { id: existing.id },
        data: {
          email: appEmail,
          name,
          realEmail: email,
          realName: name,
          type: "distributor",
          saleChannelId,
        },
        select: { id: true },
      })
    : await tx.user.create({
        data: {
          keycloakSub: randomUUID(),
          email: appEmail,
          name,
          realEmail: email,
          realName: name,
          type: "distributor",
          saleChannelId,
        },
        select: { id: true },
      });

  await tx.userStore.createMany({
    data: [{ userId: user.id, storeId }],
    skipDuplicates: true,
  });

  return user.id;
}

export async function redeemStoreMagicLinkToken(
  token: string,
): Promise<AppUserAuthFields | null> {
  const tokenHash = hashMagicLinkToken(token);
  const now = new Date();

  const userId = await prisma.$transaction(async (tx) => {
    const magicLink = await tx.saleChannelMagicLink.findUnique({
      where: { tokenHash },
      include: {
        saleChannel: {
          select: {
            id: true,
            name: true,
            type: true,
            email: true,
            storeId: true,
          },
        },
      },
    });

    if (!magicLink) return null;
    if (magicLink.revokedAt) return null;
    if (magicLink.expiresAt <= now) return null;
    if (magicLink.saleChannel.type !== "store") return null;
    if (magicLink.saleChannel.storeId !== magicLink.storeId) return null;

    const loginUserId = await ensureStoreSaleChannelLoginUser(tx, {
      saleChannelId: magicLink.saleChannel.id,
      storeId: magicLink.saleChannel.storeId,
      name: magicLink.saleChannel.name,
      email: magicLink.saleChannel.email,
    });

    await tx.saleChannelMagicLink.update({
      where: { id: magicLink.id },
      data: {
        lastUsedAt: now,
        useCount: { increment: 1 },
      },
    });

    return loginUserId;
  });

  return userId ? findUserById(userId) : null;
}
