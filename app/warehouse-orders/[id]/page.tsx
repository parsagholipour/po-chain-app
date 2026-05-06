import type { Metadata } from "next";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreContextForUserId } from "@/lib/store-context";
import { WarehouseOrderDetailView } from "./warehouse-order-detail-view";

const idSchema = z.string().uuid();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { title: "Warehouse order" };

  const session = await auth();
  if (!session?.user?.id) return { title: "Warehouse order" };

  const storeContext = await getStoreContextForUserId(session.user.id);
  if (!storeContext) return { title: "Warehouse order" };

  const row = await prisma.warehouseOrder.findFirst({
    where: { id: parsed.data, storeId: storeContext.storeId },
    select: { name: true },
  });

  if (!row) return { title: "Warehouse order - Not found" };
  return { title: row.name };
}

export default async function WarehouseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WarehouseOrderDetailView warehouseOrderId={id} />;
}
