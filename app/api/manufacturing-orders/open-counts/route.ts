import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const byManufacturer = await prisma.manufacturingOrderManufacturer.groupBy({
    by: ["manufacturerId"],
    where: {
      storeId,
      manufacturingOrder: { status: { not: "closed" } },
    },
    _count: { _all: true },
  });

  const manufacturerCounts: Record<string, number> = {};
  for (const row of byManufacturer) {
    manufacturerCounts[row.manufacturerId] = row._count._all;
  }

  return NextResponse.json({
    byManufacturer: manufacturerCounts,
  });
}
