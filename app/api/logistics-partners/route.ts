import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, requireAppUserId } from "@/lib/session-user";
import {
  logisticsPartnerCreateSchema,
  logisticsPartnerTypeSchema,
} from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const typeRaw = searchParams.get("type");

  if (typeRaw) {
    const parsedType = logisticsPartnerTypeSchema.safeParse(typeRaw);
    if (!parsedType.success) return jsonFromZod(parsedType.error);

    const rows = await prisma.logisticsPartner.findMany({
      where: { type: parsedType.data },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(rows);
  }

  const rows = await prisma.logisticsPartner.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const authz = await requireAppUserId();
  if (!authz.ok) return authz.response;
  const userId = authz.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = logisticsPartnerCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const { name, logoKey, contactNumber, link, type } = parsed.data;

  try {
    const partner = await prisma.logisticsPartner.create({
      data: {
        name,
        logoKey: logoKey ?? null,
        contactNumber: contactNumber ?? null,
        link: link ?? null,
        type,
        createdById: userId,
      },
    });
    return NextResponse.json(partner, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
