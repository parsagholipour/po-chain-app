import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { orderStatusLogFromPrisma, orderStatusLogInclude } from "@/lib/order-status-log";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

const patchSchema = z.object({
  note: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    z.string().max(5000).nullable(),
  ),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext();
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const existing = await prisma.orderStatusLog.findFirst({
      where: { id: pid.data.id, storeId },
      select: { id: true },
    });
    if (!existing) {
      return jsonError("Not found", 404);
    }

    const row = await prisma.orderStatusLog.update({
      where: { id: pid.data.id },
      data: { note: parsed.data.note },
      include: orderStatusLogInclude,
    });

    return NextResponse.json(orderStatusLogFromPrisma(row));
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
