import "server-only";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/json-error";
import {
  ACTIVE_STORE_COOKIE,
  listUserStores,
  type StoreContext,
} from "@/lib/store";

export async function getStoreContextForUserId(
  userId: string,
): Promise<StoreContext | null> {
  const stores = await listUserStores(userId);
  if (stores.length === 0) return null;

  const cookieStore = await cookies();
  const requestedStoreId = cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? null;
  const activeStore = stores.find((store) => store.id === requestedStoreId) ?? stores[0];

  return {
    userId,
    storeId: activeStore.id,
    stores,
    activeStore,
  };
}

export async function getStoreContext(): Promise<StoreContext | null> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) return null;

  return getStoreContextForUserId(userId);
}

export async function requireStoreContext(): Promise<
  { ok: true; context: StoreContext } | { ok: false; response: NextResponse }
> {
  const context = await getStoreContext();
  if (!context) {
    const session = await auth();
    if (!session?.user) {
      return { ok: false, response: jsonError("Unauthorized", 401) };
    }
    return {
      ok: false,
      response: jsonError("No stores are assigned to your account", 403),
    };
  }

  return { ok: true, context };
}
