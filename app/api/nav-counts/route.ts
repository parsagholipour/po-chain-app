import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR, PURCHASE_ORDER_TYPE_STOCK } from "@/lib/purchase-order-type";
import { isDistributorContext, requireStoreContext } from "@/lib/store-context";
import { jsonError } from "@/lib/json-error";

export const runtime = "nodejs";

export async function GET() {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;
  const isDistributor = isDistributorContext(authz.context);
  const distributorSaleChannelId = authz.context.saleChannelId;
  if (isDistributor && !distributorSaleChannelId) {
    return jsonError("Distributor account is not linked to a sale channel", 403);
  }

  if (isDistributor) {
    const purchaseOrders = await prisma.purchaseOrder.count({
      where: {
        storeId,
        type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        saleChannelId: distributorSaleChannelId,
        status: { not: "closed" },
      },
    });

    return NextResponse.json({
      purchaseOrders,
      stockOrders: 0,
      manufacturingOrders: 0,
      warehouseOrders: 0,
    });
  }

  const [purchaseOrders, stockOrders, manufacturingOrders, warehouseOrders] = await Promise.all([
    prisma.purchaseOrder.count({
      where: {
        storeId,
        type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        status: { not: "closed" },
      },
    }),
    prisma.purchaseOrder.count({
      where: {
        storeId,
        type: PURCHASE_ORDER_TYPE_STOCK,
        status: { not: "closed" },
      },
    }),
    prisma.manufacturingOrder.count({
      where: {
        storeId,
        status: { not: "closed" },
      },
    }),
    prisma.warehouseOrder.count({
      where: {
        storeId,
        status: { not: "closed" },
      },
    }),
  ]);

  return NextResponse.json({ purchaseOrders, stockOrders, manufacturingOrders, warehouseOrders });
}
