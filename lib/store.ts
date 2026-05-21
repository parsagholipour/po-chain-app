import "server-only";

import { cookies } from "next/headers";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_STORE_THEME,
  normalizeStoreTheme,
  type StoreTheme,
} from "@/lib/store-theme";

export const ACTIVE_STORE_COOKIE = "po_active_store_id";
export const DEFAULT_STORE_SLUG = "arcane-fortress";
export const DEFAULT_STORE_NAME = "Arcane Fortress";
export const STORE_CACHE_TAG = "stores";
export const STORE_CACHE_REVALIDATE_SECONDS = 60 * 60 * 24;

export type StoreOption = {
  id: string;
  slug: string;
  name: string;
  logoKey: string | null;
  theme: StoreTheme;
};

export type AppUserType = "internal" | "distributor";
export type AppSaleChannelType = "distributor" | "store" | "amazon" | "cjdropshipping";

export type AppUserAuthFields = {
  id: string;
  realEmail: string | null;
  realName: string | null;
  type: AppUserType;
  saleChannelId: string | null;
  saleChannelType: AppSaleChannelType | null;
};

export type StoreContext = {
  userId: string;
  userType: AppUserType;
  saleChannelId: string | null;
  saleChannelName: string | null;
  saleChannelType: AppSaleChannelType | null;
  storeId: string;
  stores: StoreOption[];
  activeStore: StoreOption;
};

function userAuthFieldsFromPrisma(user: {
  id: string;
  realEmail: string | null;
  realName: string | null;
  type: AppUserType;
  saleChannelId: string | null;
  saleChannel: { type: AppSaleChannelType } | null;
}): AppUserAuthFields {
  return {
    id: user.id,
    realEmail: user.realEmail,
    realName: user.realName,
    type: user.type,
    saleChannelId: user.saleChannelId,
    saleChannelType: user.saleChannel?.type ?? null,
  };
}

function toStoreOption(store: {
  id: string;
  slug: string;
  name: string;
  logoKey: string | null;
  theme: unknown;
}): StoreOption {
  return {
    id: store.id,
    slug: store.slug,
    name: store.name,
    logoKey: store.logoKey,
    theme: normalizeStoreTheme(store.theme),
  };
}

async function ensureDefaultStoreSaleChannel(
  tx: Prisma.TransactionClient,
  {
    storeId,
    createdById,
  }: {
    storeId: string;
    createdById: string;
  },
) {
  const existing = await tx.saleChannel.findFirst({
    where: { storeId, type: "store" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const row = await tx.saleChannel.create({
    data: {
      name: "Store by magic link",
      type: "store",
      notes: "Default storefront sale channel for magic-link orders.",
      storeId,
      createdById,
    },
    select: { id: true },
  });
  return row.id;
}

/** Always read from DB — cached store lists survived migrate reset and hid seeded data. */
export async function listUserStores(userId: string): Promise<StoreOption[]> {
  const rows = await prisma.userStore.findMany({
    where: { userId },
    select: {
      store: {
        select: {
          id: true,
          slug: true,
          name: true,
          logoKey: true,
          theme: true,
        },
      },
    },
    orderBy: [{ store: { name: "asc" } }],
  });

  return rows.map((row) => toStoreOption(row.store));
}

export async function canAccessStore(userId: string, storeId: string) {
  const row = await prisma.userStore.findUnique({
    where: { userId_storeId: { userId, storeId } },
    select: {
      store: {
        select: {
          id: true,
          slug: true,
          name: true,
          logoKey: true,
          theme: true,
        },
      },
    },
  });

  return row?.store ? toStoreOption(row.store) : null;
}

export async function syncUserWithDefaultStore({
  keycloakSub,
  email,
  name,
  realEmail,
  realName,
}: {
  keycloakSub: string;
  email: string;
  name: string | null;
  realEmail?: string | null;
  realName?: string | null;
}): Promise<AppUserAuthFields> {
  return prisma.$transaction(async (tx) => {
    await tx.store.createMany({
      data: [
        {
          slug: DEFAULT_STORE_SLUG,
          name: DEFAULT_STORE_NAME,
          theme: DEFAULT_STORE_THEME,
        },
      ],
      skipDuplicates: true,
    });

    const store = await tx.store.findUniqueOrThrow({
      where: { slug: DEFAULT_STORE_SLUG },
      select: { id: true, name: true },
    });

    const user = await tx.user.upsert({
      where: { keycloakSub },
      create: {
        keycloakSub,
        email,
        name,
        realEmail: realEmail ?? null,
        realName: realName ?? null,
        type: "internal",
      },
      update: {
        email,
        name,
        ...(realEmail !== undefined ? { realEmail } : {}),
        ...(realName !== undefined ? { realName } : {}),
      },
    });

    await tx.userStore.createMany({
      data: [
        {
          userId: user.id,
          storeId: store.id,
        },
      ],
      skipDuplicates: true,
    });

    await ensureDefaultStoreSaleChannel(tx, {
      storeId: store.id,
      createdById: user.id,
    });

    return {
      id: user.id,
      realEmail: user.realEmail,
      realName: user.realName,
      type: user.type,
      saleChannelId: user.saleChannelId,
      saleChannelType: null,
    };
  });
}

export async function findUserByKeycloakSub(keycloakSub: string) {
  const user = await prisma.user.findUnique({
    where: { keycloakSub },
    select: {
      id: true,
      realEmail: true,
      realName: true,
      type: true,
      saleChannelId: true,
      saleChannel: { select: { type: true } },
    },
  });
  return user ? userAuthFieldsFromPrisma(user) : null;
}

export async function findUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      realEmail: true,
      realName: true,
      type: true,
      saleChannelId: true,
      saleChannel: { select: { type: true } },
    },
  });
  return user ? userAuthFieldsFromPrisma(user) : null;
}

export async function ensureDefaultStoreForUser(userId: string): Promise<StoreOption | null> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return null;

    await tx.store.createMany({
      data: [
        {
          slug: DEFAULT_STORE_SLUG,
          name: DEFAULT_STORE_NAME,
          theme: DEFAULT_STORE_THEME,
        },
      ],
      skipDuplicates: true,
    });

    const store = await tx.store.findUniqueOrThrow({
      where: { slug: DEFAULT_STORE_SLUG },
      select: {
        id: true,
        slug: true,
        name: true,
        logoKey: true,
        theme: true,
      },
    });

    await tx.userStore.createMany({
      data: [
        {
          userId,
          storeId: store.id,
        },
      ],
      skipDuplicates: true,
    });

    await ensureDefaultStoreSaleChannel(tx, {
      storeId: store.id,
      createdById: userId,
    });

    return toStoreOption(store);
  });
}

export async function setActiveStoreCookie(storeId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    priority: "high",
  });
}
