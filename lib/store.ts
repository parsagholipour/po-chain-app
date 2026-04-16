import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const ACTIVE_STORE_COOKIE = "po_active_store_id";
export const DEFAULT_STORE_SLUG = "arcane-fortress";
export const DEFAULT_STORE_NAME = "Arcane Fortress";

export type StoreOption = {
  id: string;
  slug: string;
  name: string;
};

export type StoreContext = {
  userId: string;
  storeId: string;
  stores: StoreOption[];
  activeStore: StoreOption;
};

export async function listUserStores(userId: string): Promise<StoreOption[]> {
  const rows = await prisma.userStore.findMany({
    where: { userId },
    select: {
      store: {
        select: {
          id: true,
          slug: true,
          name: true,
        },
      },
    },
    orderBy: [{ store: { name: "asc" } }],
  });

  return rows.map((row) => row.store);
}

export async function syncUserWithDefaultStore({
  keycloakSub,
  email,
  name,
}: {
  keycloakSub: string;
  email: string;
  name: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const store = await tx.store.upsert({
      where: { slug: DEFAULT_STORE_SLUG },
      create: {
        slug: DEFAULT_STORE_SLUG,
        name: DEFAULT_STORE_NAME,
      },
      update: {
        name: DEFAULT_STORE_NAME,
      },
    });

    const user = await tx.user.upsert({
      where: { keycloakSub },
      create: { keycloakSub, email, name },
      update: { email, name },
    });

    await tx.userStore.upsert({
      where: {
        userId_storeId: {
          userId: user.id,
          storeId: store.id,
        },
      },
      create: {
        userId: user.id,
        storeId: store.id,
      },
      update: {},
    });

    return user;
  });
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
        },
      },
    },
  });

  return row?.store ?? null;
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
