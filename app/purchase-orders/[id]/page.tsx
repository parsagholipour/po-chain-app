import type { Metadata } from "next";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { getStoreContextForUserId } from "@/lib/store-context";
import { PoDetailView } from "./po-detail-view";

const idSchema = z.string().uuid();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return { title: "Purchase order" };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { title: "Purchase order" };
  }

  const storeContext = await getStoreContextForUserId(session.user.id);
  if (!storeContext) {
    return { title: "Purchase order" };
  }

  const row = await prisma.purchaseOrder.findFirst({
    where: {
      id: parsed.data,
      storeId: storeContext.storeId,
      type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
    },
    select: {
      name: true,
      saleChannel: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!row) {
    return { title: "Purchase order - Not found" };
  }

  return {
    title: row.saleChannel?.name ? `${row.name} - ${row.saleChannel.name}` : row.name,
  };
}

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PoDetailView purchaseOrderId={id} />;
}
