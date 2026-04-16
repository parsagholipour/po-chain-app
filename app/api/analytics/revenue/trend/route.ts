import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { parseAnalyticsRange } from "@/lib/analytics/date-range";
import { getRevenueSeries } from "@/lib/analytics/queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const range = parseAnalyticsRange(searchParams);
  const points = await getRevenueSeries(storeId, range);
  return NextResponse.json({ range, points });
}
