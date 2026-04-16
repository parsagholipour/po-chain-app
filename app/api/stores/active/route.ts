import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import { requireAppUserId } from "@/lib/session-user";
import { canAccessStore, setActiveStoreCookie } from "@/lib/store";

export const runtime = "nodejs";

const activeStoreSchema = z.object({
  storeId: z.uuid(),
});

export async function POST(request: Request) {
  const authz = await requireAppUserId();
  if (!authz.ok) return authz.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = activeStoreSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const store = await canAccessStore(authz.userId, parsed.data.storeId);
  if (!store) {
    return jsonError("Store is not assigned to your account", 403);
  }

  await setActiveStoreCookie(store.id);

  return NextResponse.json(store);
}
