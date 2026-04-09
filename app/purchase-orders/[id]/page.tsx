import type { Metadata } from "next";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
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
  if (!session?.user) {
    return { title: "Purchase order" };
  }

  const row = await prisma.purchaseOrder.findFirst({
    where: { id: parsed.data, type: PURCHASE_ORDER_TYPE_DISTRIBUTOR },
    select: { name: true, number: true },
  });

  if (!row) {
    return { title: "Purchase order · Not found" };
  }

  return { title: `${row.name} · PO #${row.number}` };
}

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PoDetailView purchaseOrderId={id} />;
}
