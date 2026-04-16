import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreContext } from "@/lib/store-context";
import {
  logisticsPartnerCreateSchema,
  logisticsPartnerTypeSchema,
} from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const typeRaw = searchParams.get("type");

  if (typeRaw) {
    const parsedType = logisticsPartnerTypeSchema.safeParse(typeRaw);
    if (!parsedType.success) return jsonFromZod(parsedType.error);

    const rows = await prisma.logisticsPartner.findMany({
      where: { storeId, type: parsedType.data },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(rows);
  }

  const rows = await prisma.logisticsPartner.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

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
        storeId,
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
