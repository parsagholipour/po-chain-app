import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { productCreateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const rows = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      defaultManufacturer: true,
    },
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

  const parsed = productCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    const row = await prisma.product.create({
      data: {
        name: parsed.data.name,
        sku: parsed.data.sku,
        imageKey: parsed.data.imageKey ?? null,
        barcodeKey: parsed.data.barcodeKey ?? null,
        packagingKey: parsed.data.packagingKey ?? null,
        defaultManufacturerId: parsed.data.defaultManufacturerId,
        verified: parsed.data.verified ?? false,
        createdById: userId,
      },
      include: { defaultManufacturer: true },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
