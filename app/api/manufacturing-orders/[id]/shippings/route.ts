import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { moShippingCreateSchema } from "@/lib/validations/manufacturing-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.uuid() });

function toDate(v: string) {
  return new Date(v);
}

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

  const parsed = moShippingCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const mo = await prisma.manufacturingOrder.findUnique({ where: { id: pid.data.id } });
  if (!mo) return jsonError("Manufacturing order not found", 404);

  try {
    await prisma.$transaction(async (tx) => {
      const ship = await tx.manufacturingShipping.create({
        data: {
          trackingNumber: parsed.data.trackingNumber,
          shippedAt: toDate(parsed.data.shippedAt),
          invoiceDocumentKey: parsed.data.invoiceDocumentKey ?? null,
          createdById: userId,
        },
      });
      await tx.manufacturingOrderManufacturingShipping.create({
        data: {
          manufacturingOrderId: pid.data.id,
          manufacturingShippingId: ship.id,
        },
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
