import type { Metadata } from "next";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MoDetailView } from "./mo-detail-view";

const idSchema = z.string().uuid();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return { title: "Manufacturing order" };
  }

  const session = await auth();
  if (!session?.user) {
    return { title: "Manufacturing order" };
  }

  const row = await prisma.manufacturingOrder.findUnique({
    where: { id: parsed.data },
    select: { name: true, number: true },
  });

  if (!row) {
    return { title: "Manufacturing order · Not found" };
  }

  return { title: `${row.name} · MO #${row.number}` };
}

export default async function ManufacturingOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MoDetailView manufacturingOrderId={id} />;
}
