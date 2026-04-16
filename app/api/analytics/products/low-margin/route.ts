import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { parseAnalyticsRange } from "@/lib/analytics/date-range";
import { getProductLeaderboard } from "@/lib/analytics/queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const { searchParams } = new URL(request.url);
  const range = parseAnalyticsRange(searchParams);
  const threshold = Number(searchParams.get("threshold") ?? "20");
  const rows = (await getProductLeaderboard(storeId, range, 500))
    .filter((row) => row.marginPct <= threshold)
    .sort((a, b) => a.marginPct - b.marginPct);
  return NextResponse.json({ threshold, rows });
}
