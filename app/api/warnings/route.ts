import { NextResponse } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/json-error";
import { requireInternalStoreContext } from "@/lib/store-context";
import { operatorWarningInclude, serializeOperatorWarning, serializeWarningScanState } from "@/lib/operator-warnings/serialize";
import { OPERATOR_WARNING_TIERS, OPERATOR_WARNING_TYPES } from "@/lib/operator-warnings/labels";
import type { OperatorWarningTier, OperatorWarningType, OperatorWarningsResponse } from "@/lib/types/api";

export const runtime = "nodejs";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isWarningType(value: string): value is OperatorWarningType {
  return (OPERATOR_WARNING_TYPES as readonly string[]).includes(value);
}

function isWarningTier(value: string): value is OperatorWarningTier {
  return (OPERATOR_WARNING_TIERS as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const statusRaw = searchParams.get("status") ?? "open";
  if (statusRaw !== "open" && statusRaw !== "disregarded") {
    return jsonError("status must be open or disregarded", 400);
  }
  const typeRaw = searchParams.get("type")?.trim() ?? "";
  const tierRaw = searchParams.get("tier")?.trim() ?? "";

  const where: Prisma.OperatorWarningWhereInput = {
    storeId,
    status: statusRaw,
  };
  if (typeRaw) {
    if (!isWarningType(typeRaw)) {
      return jsonError("Invalid warning type", 400);
    }
    where.type = typeRaw;
  }
  if (tierRaw) {
    if (!isWarningTier(tierRaw)) {
      return jsonError("Invalid warning severity", 400);
    }
    where.tier = tierRaw;
  }
  if (q.length > 0) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { message: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { disregardReason: { contains: q, mode: "insensitive" } },
    ];
  }

  const page = parsePositiveInt(searchParams.get("page"), DEFAULT_PAGE);
  const pageSize = Math.min(
    parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  const [total, rows, scan] = await prisma.$transaction([
    prisma.operatorWarning.count({ where }),
    prisma.operatorWarning.findMany({
      where,
      include: operatorWarningInclude,
      orderBy: [{ tier: "desc" }, { lastSeenAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.operatorWarningScanState.findUnique({ where: { storeId } }),
  ]);

  const payload: OperatorWarningsResponse = {
    rows: rows.map(serializeOperatorWarning),
    total,
    page,
    pageSize,
    scan: serializeWarningScanState(scan),
  };
  return NextResponse.json(payload);
}
