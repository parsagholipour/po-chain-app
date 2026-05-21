import { NextResponse } from "next/server";
import { requireInternalStoreContext } from "@/lib/store-context";
import { listProductStockSnapshotBackups } from "@/lib/product-stock-snapshot-backups";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireInternalStoreContext();
  if (!authz.ok) return authz.response;

  const rows = await listProductStockSnapshotBackups(authz.context.storeId);
  return NextResponse.json(rows);
}
