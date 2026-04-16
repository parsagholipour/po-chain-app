import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productUpdateSchema } from "@/lib/validations/master-data";
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

  const row = await prisma.product.findFirst({
    where: { id: pid.data.id, storeId },
    include: { defaultManufacturer: true, category: true },
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

  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  try {
    const existing = await prisma.product.findFirst({
      where: { id: pid.data.id, storeId },
      select: { id: true },
    });
    if (!existing) return jsonError("Not found", 404);

    if (parsed.data.defaultManufacturerId) {
      const manufacturer = await prisma.manufacturer.findFirst({
        where: {
          id: parsed.data.defaultManufacturerId,
          storeId,
        },
        select: { id: true },
      });
      if (!manufacturer) {
        return jsonError("Default manufacturer was not found", 400);
      }
    }

    if (parsed.data.categoryId) {
      const category = await prisma.productCategory.findFirst({
        where: {
          id: parsed.data.categoryId,
          storeId,
        },
        select: { id: true },
      });
      if (!category) {
        return jsonError("Product category was not found", 400);
      }
    }

    const row = await prisma.product.update({
      where: { id: pid.data.id },
      data: parsed.data,
      include: { defaultManufacturer: true, category: true },
    });
    return NextResponse.json(row);
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  try {
    const deleted = await prisma.product.deleteMany({
      where: { id: pid.data.id, storeId },
    });
    if (deleted.count === 0) return jsonError("Not found", 404);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
