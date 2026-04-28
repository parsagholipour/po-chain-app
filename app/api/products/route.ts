import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { productCreateSchema } from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";
import type { Prisma } from "@/app/generated/prisma/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const categoryIdRaw = searchParams.get("categoryId");
  const typeIdRaw = searchParams.get("typeId");

  const where: Prisma.ProductWhereInput = { storeId };
  if (q.length > 0) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { defaultManufacturer: { name: { contains: q, mode: "insensitive" } } },
      { category: { name: { contains: q, mode: "insensitive" } } },
      { type: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (categoryIdRaw === "none") {
    where.categoryId = null;
  } else {
    const categoryId = categoryIdRaw ? z.uuid().safeParse(categoryIdRaw) : null;
    if (categoryId?.success) {
      where.categoryId = categoryId.data;
    }
  }
  if (typeIdRaw === "none") {
    where.typeId = null;
  } else {
    const typeId = typeIdRaw ? z.uuid().safeParse(typeIdRaw) : null;
    if (typeId?.success) {
      where.typeId = typeId.data;
    }
  }

  const rows = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      defaultManufacturer: true,
      category: true,
      type: true,
    },
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

  const parsed = productCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  try {
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

    if (parsed.data.typeId) {
      const type = await prisma.productType.findFirst({
        where: {
          id: parsed.data.typeId,
          storeId,
        },
        select: { id: true },
      });
      if (!type) {
        return jsonError("Product type was not found", 400);
      }
    }

    const row = await prisma.product.create({
      data: {
        name: parsed.data.name,
        sku: parsed.data.sku,
        cost: parsed.data.cost ?? null,
        price: parsed.data.price ?? null,
        imageKey: parsed.data.imageKey ?? null,
        barcodeKey: parsed.data.barcodeKey ?? null,
        packagingKey: parsed.data.packagingKey ?? null,
        storeId,
        defaultManufacturerId: parsed.data.defaultManufacturerId,
        categoryId: parsed.data.categoryId ?? null,
        typeId: parsed.data.typeId ?? null,
        verified: parsed.data.verified ?? false,
        createdById: userId,
      },
      include: { defaultManufacturer: true, category: true, type: true },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
