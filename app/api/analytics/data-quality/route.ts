import { NextResponse } from "next/server";
import { requireStoreContext } from "@/lib/store-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [
    missingCatalogPricing,
    missingLinePricing,
    unverifiedAllocations,
    missingEtaPivots,
    staleTransitDistributorOrders,
    unverifiedProducts,
  ] = await Promise.all([
    prisma.product.findMany({
      where: { storeId, OR: [{ cost: null }, { price: null }] },
      select: { id: true, name: true, sku: true },
      take: 100,
    }),
    prisma.purchaseOrderLine.findMany({
      where: { storeId, OR: [{ unitCost: null }, { unitPrice: null }] },
      select: { id: true, quantity: true, purchaseOrder: { select: { number: true } }, product: { select: { name: true } } },
      take: 100,
    }),
    prisma.manufacturingOrderPurchaseOrderLine.findMany({
      where: { storeId, verified: false },
      select: {
        purchaseOrderLineId: true,
        manufacturer: { select: { name: true } },
      },
      take: 100,
    }),
    prisma.manufacturingOrderManufacturer.findMany({
      where: { storeId, manufacturingStartedAt: { not: null }, estimatedCompletionAt: null },
      select: { manufacturingOrderId: true, manufacturer: { select: { name: true } } },
      take: 100,
    }),
    prisma.purchaseOrder.findMany({
      where: {
        storeId,
        type: "distributor",
        status: "in_transit",
        updatedAt: { lt: fourteenDaysAgo },
      },
      select: { id: true, number: true, name: true },
      take: 100,
    }),
    prisma.product.findMany({
      where: { storeId, verified: false },
      select: { id: true, name: true, sku: true },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    missingCatalogPricing: missingCatalogPricing.map((row) => ({ id: row.id, label: row.name, note: row.sku })),
    missingLinePricing: missingLinePricing.map((row) => ({
      id: row.id,
      label: row.product.name,
      note: `PO #${row.purchaseOrder.number} · qty ${row.quantity}`,
    })),
    unverifiedAllocations: unverifiedAllocations.map((row) => ({
      id: row.purchaseOrderLineId,
      label: `PO line ${row.purchaseOrderLineId.slice(0, 8)}`,
      note: row.manufacturer.name,
    })),
    missingEtaPivots: missingEtaPivots.map((row) => ({
      id: `${row.manufacturingOrderId}-${row.manufacturer.name}`,
      label: `MO ${row.manufacturingOrderId.slice(0, 8)}`,
      note: row.manufacturer.name,
    })),
    staleTransitDistributorOrders: staleTransitDistributorOrders.map((row) => ({
      id: row.id,
      label: `PO #${row.number}`,
      note: row.name,
    })),
    unverifiedProducts: unverifiedProducts.map((row) => ({ id: row.id, label: row.name, note: row.sku })),
  });
}
