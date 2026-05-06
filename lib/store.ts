import "server-only";

import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
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
  theme: StoreTheme;
};

export type StoreContext = {
  userId: string;
  storeId: string;
  stores: StoreOption[];
  activeStore: StoreOption;
};

function toStoreOption(store: {
  id: string;
  slug: string;
  name: string;
  theme: unknown;
}): StoreOption {
  return {
    id: store.id,
    slug: store.slug,
    name: store.name,
    theme: normalizeStoreTheme(store.theme),
  };
}

const listUserStoresCached = unstable_cache(
  async (userId: string): Promise<StoreOption[]> => {
    const rows = await prisma.userStore.findMany({
      where: { userId },
      select: {
        store: {
          select: {
            id: true,
            slug: true,
            name: true,
            theme: true,
          },
        },
      },
      orderBy: [{ store: { name: "asc" } }],
    });

    return rows.map((row) => toStoreOption(row.store));
  },
  ["user-stores"],
  {
    tags: [STORE_CACHE_TAG],
    revalidate: STORE_CACHE_REVALIDATE_SECONDS,
  },
);

export async function listUserStores(userId: string): Promise<StoreOption[]> {
  return listUserStoresCached(userId);
}

const canAccessStoreCached = unstable_cache(
  async (userId: string, storeId: string): Promise<StoreOption | null> => {
    const row = await prisma.userStore.findUnique({
      where: { userId_storeId: { userId, storeId } },
      select: {
        store: {
          select: {
            id: true,
            slug: true,
            name: true,
            theme: true,
          },
        },
      },
    });

    return row?.store ? toStoreOption(row.store) : null;
  },
  ["user-store-access"],
  {
    tags: [STORE_CACHE_TAG],
    revalidate: STORE_CACHE_REVALIDATE_SECONDS,
  },
);

export async function canAccessStore(userId: string, storeId: string) {
  return canAccessStoreCached(userId, storeId);
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
}) {
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
      select: { id: true },
    });

    const user = await tx.user.upsert({
      where: { keycloakSub },
      create: {
        keycloakSub,
        email,
        name,
        realEmail: realEmail ?? null,
        realName: realName ?? null,
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

    return user;
  });
}

export async function findUserByKeycloakSub(keycloakSub: string) {
  return prisma.user.findUnique({
    where: { keycloakSub },
    select: {
      id: true,
      realEmail: true,
      realName: true,
    },
  });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      realEmail: true,
      realName: true,
    },
  });
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
