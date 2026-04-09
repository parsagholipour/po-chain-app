import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { jsonError } from "@/lib/json-error";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const byManufacturer = await prisma.manufacturingOrderManufacturer.groupBy({
    by: ["manufacturerId"],
    where: { manufacturingOrder: { status: { not: "closed" } } },
    _count: { _all: true },
  });

  const manufacturerCounts: Record<string, number> = {};
  for (const row of byManufacturer) {
    manufacturerCounts[row.manufacturerId] = row._count._all;
  }

  return NextResponse.json({ byManufacturer: manufacturerCounts });
}
