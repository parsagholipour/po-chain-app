import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productTypeCreateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const rows = await prisma.productType.findMany({
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

  const parsed = productTypeCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const row = await prisma.productType.create({
      data: {
        name: parsed.data.name,
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
