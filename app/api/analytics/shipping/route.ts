import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { parseAnalyticsRange } from "@/lib/analytics/date-range";
import { prisma } from "@/lib/prisma";
import { shippingDateWhere } from "@/lib/analytics/where";

export const runtime = "nodejs";

function n(value: unknown): number {
  return Number(value ?? 0) || 0;
}

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const { searchParams } = new URL(request.url);
  const range = parseAnalyticsRange(searchParams);

  const rows = await prisma.shipping.findMany({
    where: { storeId, ...shippingDateWhere(range) },
    select: {
      id: true,
      type: true,
      status: true,
      cost: true,
      deliveryDutiesPaid: true,
      createdAt: true,
      shippedAt: true,
      logisticsPartnerId: true,
      logisticsPartner: { select: { name: true } },
    },
  });

  const byPartner: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let ddpCount = 0;
  let leadTimeDays = 0;

  for (const row of rows) {
    const partner = row.logisticsPartner?.name ?? "Unassigned";
    byPartner[partner] = (byPartner[partner] ?? 0) + n(row.cost);
    byType[row.type] = (byType[row.type] ?? 0) + n(row.cost);
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    if (row.deliveryDutiesPaid) ddpCount += 1;
    const end = row.shippedAt ?? row.createdAt;
    leadTimeDays += Math.max(0, (end.getTime() - row.createdAt.getTime()) / (24 * 60 * 60 * 1000));
  }

  return NextResponse.json({
    byPartner,
    byType,
    byStatus,
    ddpSharePct: rows.length ? (ddpCount / rows.length) * 100 : 0,
    avgLeadTimeDays: rows.length ? leadTimeDays / rows.length : 0,
  });
}
