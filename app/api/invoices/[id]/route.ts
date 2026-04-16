import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoicePatchSchema, invoicePatchToPrisma } from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";
import { z } from "zod";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  const row = await prisma.invoice.findFirst({
    where: { id: pid.data.id, storeId },
    include: {
      manufacturingOrderManufacturer: {
        include: { manufacturer: true, manufacturingOrder: true },
      },
    },
  });
  if (!row) return jsonError("Not found", 404);
  return NextResponse.json(row);
}

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

  const parsed = invoicePatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const data = invoicePatchToPrisma(parsed.data);
  if (Object.keys(data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  try {
    const existing = await prisma.invoice.findFirst({
      where: { id: pid.data.id, storeId },
      select: { id: true },
    });
    if (!existing) return jsonError("Not found", 404);

    const row = await prisma.invoice.update({
      where: { id: pid.data.id },
      data,
      include: {
        manufacturingOrderManufacturer: {
          include: { manufacturer: true, manufacturingOrder: true },
        },
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
