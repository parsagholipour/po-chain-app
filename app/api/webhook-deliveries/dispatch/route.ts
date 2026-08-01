import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { dispatchWebhookDeliveries } from "@/lib/webhooks/delivery";

export const runtime = "nodejs";

const dispatchSchema = z
  .object({
    limit: z.number().int().positive().max(200).optional(),
  })
  .optional();

/** Mirrors the notification dispatch route so an external cron can drive retries. */
function hasValidDispatchToken(request: Request) {
  const expected = process.env.WEBHOOK_DISPATCH_TOKEN?.trim();
  if (!expected) return false;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  return auth === `Bearer ${expected}`;
}

export async function POST(request: Request) {
  if (!hasValidDispatchToken(request)) {
    const authz = await requireInternalStoreContext();
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

  const result = await dispatchWebhookDeliveries({ limit: parsed.data?.limit });
  return NextResponse.json(result);
}
