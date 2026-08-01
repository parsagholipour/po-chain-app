import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { encryptWebhookSecret } from "@/lib/webhooks/encryption";
import { webhookEndpointSelect } from "@/lib/webhooks/endpoint-select";
import { generateWebhookSecret, webhookSecretLast4 } from "@/lib/webhooks/signature";
import { webhookEndpointCreateSchema } from "@/lib/validations/developer-api";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const rows = await prisma.webhookEndpoint.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    select: webhookEndpointSelect,
  });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = webhookEndpointCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const secret = generateWebhookSecret();

  try {
    const row = await prisma.webhookEndpoint.create({
      data: {
        url: parsed.data.url,
        description: parsed.data.description ?? null,
        events: parsed.data.events,
        enabled: parsed.data.enabled ?? true,
        secretEncrypted: await encryptWebhookSecret(secret),
        secretLast4: webhookSecretLast4(secret),
        storeId,
        createdById: userId,
      },
      select: webhookEndpointSelect,
    });

    // Shown once; rotate from the endpoint's actions if it is ever lost.
    return NextResponse.json({ ...row, secret }, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
