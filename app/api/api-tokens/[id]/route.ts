import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { apiTokenUpdateSchema } from "@/lib/validations/developer-api";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = apiTokenUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const updated = await prisma.apiToken.updateMany({
      where: { id: pid.data.id, storeId },
      data: { name: parsed.data.name },
    });
    if (updated.count === 0) return jsonError("Not found", 404);
    return NextResponse.json({ id: pid.data.id, name: parsed.data.name });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}

/** Revocation is a soft delete: the audit trail of past usage is kept. */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  try {
    const revoked = await prisma.apiToken.updateMany({
      where: { id: pid.data.id, storeId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: userId },
    });
    if (revoked.count === 0) return jsonError("Not found", 404);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
