import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import { dispatchNotificationEmails } from "@/lib/notifications";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const dispatchSchema = z
  .object({
    notificationIds: z.array(z.uuid()).optional(),
    limit: z.number().int().positive().max(200).optional(),
  })
  .optional();

function hasValidDispatchToken(request: Request) {
  const expected = process.env.NOTIFICATION_DISPATCH_TOKEN?.trim();
  if (!expected) return false;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  return auth === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!hasValidDispatchToken(request)) {
    const authz = await requireStoreContext();
    if (!authz.ok) return authz.response;
  }

  let body: unknown = undefined;
  try {
    const raw = await request.text();
    body = raw.trim() ? JSON.parse(raw) : undefined;
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = dispatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const result = await dispatchNotificationEmails({
    notificationIds: parsed.data?.notificationIds,
    limit: parsed.data?.limit,
  });
  return NextResponse.json(result);
}
