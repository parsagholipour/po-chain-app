import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { operatorWarningInclude, serializeOperatorWarning } from "@/lib/operator-warnings/serialize";
import { operatorWarningDisregardSchema } from "@/lib/validations/operator-warning";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

  const { id } = await ctx.params;
  const parsedId = paramsSchema.safeParse({ id });
  if (!parsedId.success) return jsonFromZod(parsedId.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = operatorWarningDisregardSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const existing = await prisma.operatorWarning.findFirst({
    where: { id: parsedId.data.id, storeId },
    select: { id: true, status: true },
  });
  if (!existing) return jsonError("Warning not found", 404);
  if (existing.status === "disregarded") {
    return jsonError("This warning is already disregarded", 409);
  }

  try {
    const row = await prisma.operatorWarning.update({
      where: { id: existing.id },
      data: {
        status: "disregarded",
        disregardReason: parsed.data.reason,
        disregardedAt: new Date(),
        disregardedById: userId,
      },
      include: operatorWarningInclude,
    });
    return NextResponse.json(serializeOperatorWarning(row));
  } catch (error) {
    const json = jsonFromPrisma(error);
    if (json) return json;
    throw error;
  }
}
