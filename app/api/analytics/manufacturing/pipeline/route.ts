import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { prisma } from "@/lib/prisma";
import { getPipelineStatusCounts } from "@/lib/analytics/queries";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const [pipeline, manufacturerFunnel, outstandingBalances, verifiedCounts] = await Promise.all([
    getPipelineStatusCounts(storeId),
    prisma.manufacturingOrderManufacturer.groupBy({
      by: ["status"],
      where: { storeId },
      _count: { _all: true },
    }),
    prisma.manufacturingOrderManufacturer.count({
      where: { storeId, depositPaidAt: { not: null }, balancePaidAt: null },
    }),
    prisma.manufacturingOrderPurchaseOrderLine.groupBy({
      by: ["verified"],
      where: { storeId },
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({
    pipeline,
    manufacturerFunnel: manufacturerFunnel.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {}),
    outstandingBalances,
    verifiedCounts: verifiedCounts.reduce<Record<string, number>>((acc, row) => {
      acc[row.verified ? "verified" : "unverified"] = row._count._all;
      return acc;
    }, { verified: 0, unverified: 0 }),
  });
}
