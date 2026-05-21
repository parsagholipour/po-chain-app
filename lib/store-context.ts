import "server-only";

import { cache } from "react";
import type { Session } from "next-auth";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/json-error";
import {
  ACTIVE_STORE_COOKIE,
  ensureDefaultStoreForUser,
  listUserStores,
  setActiveStoreCookie,
  type StoreContext,
} from "@/lib/store";
import { prisma } from "@/lib/prisma";

export const USER_TYPE_INTERNAL = "internal" as const;
export const USER_TYPE_DISTRIBUTOR = "distributor" as const;

export async function getStoreContextForUserId(
  userId: string,
): Promise<StoreContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      type: true,
      saleChannelId: true,
      saleChannel: { select: { name: true, type: true } },
    },
  });
  if (!user) return null;

  let stores = await listUserStores(userId);
  if (stores.length === 0) {
    if (user.type === USER_TYPE_DISTRIBUTOR) return null;

    const defaultStore = await ensureDefaultStoreForUser(userId);
    if (!defaultStore) return null;
    stores = [defaultStore];
  }

  const cookieStore = await cookies();
  const requestedStoreId = cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? null;
  const matchedStore = requestedStoreId
    ? stores.find((store) => store.id === requestedStoreId)
    : undefined;
  const activeStore = matchedStore ?? stores[0];

  if (requestedStoreId && !matchedStore) {
    await setActiveStoreCookie(activeStore.id);
  }

  return {
    userId,
    userType: user.type,
    saleChannelId: user.saleChannelId,
    saleChannelName: user.saleChannel?.name ?? null,
    saleChannelType: user.saleChannel?.type ?? null,
    storeId: activeStore.id,
    stores,
    activeStore,
  };
}

export type SessionStoreContextBundle = {
  session: Session | null;
  storeContext: StoreContext | null;
};

/** One auth + store resolution per React request tree (RSC, metadata, route handlers in same request). */
export const getSessionStoreContextBundle = cache(
  async (): Promise<SessionStoreContextBundle> => {
    const session = await auth();
    const userId = session?.user?.id ?? null;
    if (!userId) {
      return { session, storeContext: null };
    }
    const storeContext = await getStoreContextForUserId(userId);
    return { session, storeContext };
  },
);

export async function getStoreContext(): Promise<StoreContext | null> {
  const { storeContext } = await getSessionStoreContextBundle();
  return storeContext;
}

type StoreContextAccessOptions = {
  allowDistributor?: boolean;
};

export async function requireStoreContext(
  options: StoreContextAccessOptions = {},
): Promise<
  { ok: true; context: StoreContext } | { ok: false; response: NextResponse }
> {
  const { session, storeContext } = await getSessionStoreContextBundle();
  if (!storeContext) {
    if (!session?.user) {
      return { ok: false, response: jsonError("Unauthorized", 401) };
    }
    return {
      ok: false,
      response: jsonError("No stores are assigned to your account", 403),
    };
  }

  if (
    storeContext.userType === USER_TYPE_DISTRIBUTOR &&
    !options.allowDistributor
  ) {
    return { ok: false, response: distributorInternalForbidden() };
  }

  return { ok: true, context: storeContext };
}

export function isDistributorContext(context: StoreContext) {
  return context.userType === USER_TYPE_DISTRIBUTOR;
}

export function isStoreSaleChannelContext(context: StoreContext) {
  return context.userType === USER_TYPE_DISTRIBUTOR && context.saleChannelType === "store";
}

export function distributorWriteForbidden() {
  return jsonError("Distributor accounts are read-only", 403);
}

export function distributorInternalForbidden() {
  return jsonError("This area is only available to internal users", 403);
}

export async function requireInternalStoreContext(): Promise<
  { ok: true; context: StoreContext } | { ok: false; response: NextResponse }
> {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz;
  if (isDistributorContext(authz.context)) {
    return { ok: false, response: distributorInternalForbidden() };
  }
  return authz;
}
