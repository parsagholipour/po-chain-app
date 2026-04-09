import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ purchaseOrderId: z.uuid() });

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = await ctx.params;
  const pid = paramsSchema.safeParse({ id });
  if (!pid.success) return jsonFromZod(pid.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const mo = await prisma.manufacturingOrder.findUnique({ where: { id: pid.data.id } });
  if (!mo) return jsonError("Manufacturing order not found", 404);

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: parsed.data.purchaseOrderId },
  });
  if (!po) {
    return jsonError("Purchase order or stock order not found", 404);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.manufacturingOrderPurchaseOrder.create({
        data: {
          manufacturingOrderId: pid.data.id,
          purchaseOrderId: parsed.data.purchaseOrderId,
        },
      });

      const poLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: parsed.data.purchaseOrderId },
        select: {
          id: true,
          product: { select: { defaultManufacturerId: true } },
        },
      });

      if (poLines.length === 0) return;

      const existingManufacturers = await tx.manufacturingOrderManufacturer.findMany({
        where: { manufacturingOrderId: pid.data.id },
        select: { manufacturerId: true },
      });
      const manufacturerOnMo = new Set(existingManufacturers.map((m) => m.manufacturerId));

      for (const line of poLines) {
        const manufacturerId = line.product.defaultManufacturerId;
        if (!manufacturerOnMo.has(manufacturerId)) {
          await tx.manufacturingOrderManufacturer.create({
            data: {
              manufacturingOrderId: pid.data.id,
              manufacturerId,
              status: "initial",
              createdById: userId,
            },
          });
          manufacturerOnMo.add(manufacturerId);
        }
      }

      await tx.manufacturingOrderPurchaseOrderLine.createMany({
        data: poLines.map((line) => ({
          manufacturingOrderId: pid.data.id,
          purchaseOrderLineId: line.id,
          manufacturerId: line.product.defaultManufacturerId,
          verified: false,
          createdById: userId,
        })),
        skipDuplicates: true,
      });
    });

    const full = await prisma.manufacturingOrder.findUnique({
      where: { id: pid.data.id },
      include: manufacturingOrderDetailInclude,
    });
    return NextResponse.json(full, { status: 201 });
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
