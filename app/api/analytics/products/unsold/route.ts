import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { parseAnalyticsRange, toEndOfDay, toStartOfDay } from "@/lib/analytics/date-range";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const { searchParams } = new URL(request.url);
  const range = parseAnalyticsRange(searchParams);

  const soldRows = await prisma.purchaseOrderLine.findMany({
    where: {
      storeId,
      purchaseOrder: {
        storeId,
        type: "distributor",
        status: "closed",
        updatedAt: { gte: toStartOfDay(range.from), lte: toEndOfDay(range.to) },
      },
    },
    select: { productId: true },
  });
  const sold = new Set(soldRows.map((row) => row.productId));

  const allProducts = await prisma.product.findMany({
    where: { storeId },
    select: { id: true, name: true, sku: true },
    orderBy: { name: "asc" },
  });

  const rows = allProducts
    .filter((product) => !sold.has(product.id))
    .map((product) => ({ id: product.id, label: product.name, note: product.sku }));

  return NextResponse.json({ rows });
}
