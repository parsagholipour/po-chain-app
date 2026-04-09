import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { saleChannelCreateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const rows = await prisma.saleChannel.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = saleChannelCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const row = await prisma.saleChannel.create({
      data: {
        name: parsed.data.name,
        logoKey: parsed.data.logoKey ?? null,
        type: parsed.data.type,
        createdById: userId,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
