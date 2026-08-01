import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publicApiError, requireApiToken } from "@/lib/api-tokens";
import { publicProductInclude, serializePublicProduct } from "@/lib/public-api/product";

export const runtime = "nodejs";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const SORT_FIELDS = {
  name: "name",
  sku: "sku",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const authz = await requireApiToken(request, "products:read");
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const where: Prisma.ProductWhereInput = { storeId };

  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length > 0) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { upcGtin: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const sku = searchParams.get("sku")?.trim();
  if (sku) where.sku = sku;

  const upcGtin = searchParams.get("upcGtin")?.trim();
  if (upcGtin) where.upcGtin = upcGtin;

  for (const [param, field] of [
    ["categoryId", "categoryId"],
    ["typeId", "typeId"],
    ["collectionId", "collectionId"],
    ["manufacturerId", "defaultManufacturerId"],
  ] as const) {
    const raw = searchParams.get(param);
    if (!raw) continue;
    if (raw === "none" && field !== "defaultManufacturerId") {
      where[field] = null;
      continue;
    }
    const parsed = z.uuid().safeParse(raw);
    if (!parsed.success) {
      return publicApiError("invalid_request", `"${param}" must be a UUID.`, 400);
    }
    where[field] = parsed.data;
  }

  const verified = searchParams.get("verified");
  if (verified === "true") where.verified = true;
  if (verified === "false") where.verified = false;

  // Cursorless incremental sync: poll with the previous run's timestamp.
  const updatedSince = searchParams.get("updatedSince");
  if (updatedSince) {
    const parsedDate = new Date(updatedSince);
    if (Number.isNaN(parsedDate.getTime())) {
      return publicApiError(
        "invalid_request",
        '"updatedSince" must be an ISO 8601 timestamp.',
        400,
      );
    }
    where.updatedAt = { gte: parsedDate };
  }

  const sortParam = searchParams.get("sort") ?? "name";
  const sortField = SORT_FIELDS[sortParam as keyof typeof SORT_FIELDS];
  if (!sortField) {
    return publicApiError(
      "invalid_request",
      `"sort" must be one of: ${Object.keys(SORT_FIELDS).join(", ")}.`,
      400,
    );
  }
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  const page = parsePositiveInt(searchParams.get("page"), DEFAULT_PAGE);
  const pageSize = Math.min(
    parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { [sortField]: order },
      include: publicProductInclude,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    data: rows.map(serializePublicProduct),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasMore: page * pageSize < total,
    },
  });
}
