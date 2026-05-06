import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { warehouseCreateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const warehouseInclude = {
  saleChannel: { select: { id: true, name: true, type: true, logoKey: true } },
};

export async function GET() {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const rows = await prisma.warehouse.findMany({
    where: { storeId },
    include: warehouseInclude,
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

  const parsed = warehouseCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
    if (parsed.data.saleChannelId) {
      const saleChannel = await prisma.saleChannel.findFirst({
        where: { id: parsed.data.saleChannelId, storeId },
        select: { id: true },
      });
      if (!saleChannel) return jsonError("Sale channel not found", 400);
    }

    const row = await prisma.warehouse.create({
      data: {
        name: parsed.data.name,
        address: parsed.data.address ?? null,
        phoneNumber: parsed.data.phoneNumber ?? null,
        email: parsed.data.email ?? null,
        saleChannelId: parsed.data.saleChannelId ?? null,
        storeId,
        createdById: userId,
      },
      include: warehouseInclude,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
