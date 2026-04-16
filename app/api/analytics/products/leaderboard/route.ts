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
  const limitRaw = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
  const rows = await getProductLeaderboard(storeId, range, limit);
  return NextResponse.json({ rows });
}
