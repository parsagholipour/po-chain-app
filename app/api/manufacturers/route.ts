import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { manufacturerCreateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const rows = await prisma.manufacturer.findMany({
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

  const parsed = manufacturerCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const row = await prisma.manufacturer.create({
      data: {
        name: parsed.data.name,
        logoKey: parsed.data.logoKey ?? null,
        region: parsed.data.region,
        contactNumber: parsed.data.contactNumber ?? null,
        address: parsed.data.address ?? null,
        email: parsed.data.email ?? null,
        link: parsed.data.link ?? null,
        notes: parsed.data.notes ?? null,
        storeId,
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
