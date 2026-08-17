import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonFromZod } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 50;

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().trim().max(200).optional(),
});

export async function GET(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const searchParams = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const { page, pageSize, q } = parsed.data;
  const where: Prisma.CrmLeadWhereInput = { storeId };
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { status: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await prisma.$transaction([
    prisma.crmLead.count({ where }),
    prisma.crmLead.findMany({
      where,
      orderBy: [{ crmUpdatedAt: "desc" }, { crmLeadId: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        crmLeadId: true,
        firstName: true,
        lastName: true,
        company: true,
        email: true,
        status: true,
        crmUpdatedAt: true,
        deletedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    rows: rows.map((row) => ({
      id: row.id,
      crmLeadId: row.crmLeadId,
      firstName: row.firstName,
      lastName: row.lastName,
      company: row.company,
      email: row.email,
      status: row.status,
      crmUpdatedAt: row.crmUpdatedAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  });
}
