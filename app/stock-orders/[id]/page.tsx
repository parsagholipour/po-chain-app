import type { Metadata } from "next";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PURCHASE_ORDER_TYPE_STOCK } from "@/lib/purchase-order-type";
import { StockOrderDetailView } from "./stock-order-detail-view";

const idSchema = z.string().uuid();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return { title: "Stock order" };
  }

  const session = await auth();
  if (!session?.user) {
    return { title: "Stock order" };
  }

  const row = await prisma.purchaseOrder.findFirst({
    where: { id: parsed.data, type: PURCHASE_ORDER_TYPE_STOCK },
    select: { name: true, number: true },
  });

  if (!row) {
    return { title: "Stock order · Not found" };
  }

  return { title: `${row.name} · Stock #${row.number}` };
}

export default async function StockOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StockOrderDetailView stockOrderId={id} />;
}
