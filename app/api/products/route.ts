import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  productCreateSchema,
  productCreateToPrisma,
} from "@/lib/validations/master-data";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { requireStoreContext } from "@/lib/store-context";
import type { Prisma } from "@/app/generated/prisma/client";

export const runtime = "nodejs";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const productInclude = {
  defaultManufacturer: true,
  category: true,
  type: true,
  collection: true,
} satisfies Prisma.ProductInclude;

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const categoryIdRaw = searchParams.get("categoryId");
  const typeIdRaw = searchParams.get("typeId");
  const collectionIdRaw = searchParams.get("collectionId");
  const hasPagination = searchParams.has("page") || searchParams.has("pageSize");

  const where: Prisma.ProductWhereInput = { storeId };
  if (q.length > 0) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { upcGtin: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { defaultManufacturer: { name: { contains: q, mode: "insensitive" } } },
      { category: { name: { contains: q, mode: "insensitive" } } },
      { type: { name: { contains: q, mode: "insensitive" } } },
      { collection: { name: { contains: q, mode: "insensitive" } } },
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
  if (collectionIdRaw === "none") {
    where.collectionId = null;
  } else {
    const collectionId = collectionIdRaw ? z.uuid().safeParse(collectionIdRaw) : null;
    if (collectionId?.success) {
      where.collectionId = collectionId.data;
    }
  }

  const page = parsePositiveInt(searchParams.get("page"), DEFAULT_PAGE);
  const pageSize = Math.min(
    parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  if (hasPagination) {
    const [total, rows] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { name: "asc" },
        include: productInclude,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return NextResponse.json({ rows, total, page, pageSize });
  }

  const rows = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    include: productInclude,
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

    if (parsed.data.collectionId) {
      const collection = await prisma.productCollection.findFirst({
        where: {
          id: parsed.data.collectionId,
          storeId,
        },
        select: { id: true },
      });
      if (!collection) {
        return jsonError("Product collection was not found", 400);
      }
    }

    const row = await prisma.product.create({
      data: {
        ...productCreateToPrisma(parsed.data),
        storeId,
        createdById: userId,
      },
      include: { defaultManufacturer: true, category: true, type: true, collection: true },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
