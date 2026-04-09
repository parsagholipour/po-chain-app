import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session-user";
import { invoicePayloadToPrisma } from "@/lib/validations/purchase-order";
import { moManufacturerPatchSchema } from "@/lib/validations/manufacturing-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import { z } from "zod";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.uuid(),
  manufacturerId: z.uuid(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; manufacturerId: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const params = await ctx.params;
  const pid = paramsSchema.safeParse(params);
  if (!pid.success) return jsonFromZod(pid.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = moManufacturerPatchSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return jsonError("No fields to update", 400);
  }

  const pivot = await prisma.manufacturingOrderManufacturer.findUnique({
    where: {
      manufacturingOrderId_manufacturerId: {
        manufacturingOrderId: pid.data.id,
        manufacturerId: pid.data.manufacturerId,
      },
    },
    include: { invoice: true },
  });
  if (!pivot) return jsonError("Manufacturing order manufacturer row not found", 404);

  try {
    await prisma.$transaction(async (tx) => {
      if (parsed.data.status !== undefined) {
        await tx.manufacturingOrderManufacturer.update({
          where: {
            manufacturingOrderId_manufacturerId: {
              manufacturingOrderId: pid.data.id,
              manufacturerId: pid.data.manufacturerId,
            },
          },
          data: { status: parsed.data.status },
        });
      }

      if (parsed.data.invoice) {
        const invData = invoicePayloadToPrisma(parsed.data.invoice);
        if (pivot.invoiceId) {
          await tx.invoice.update({
            where: { id: pivot.invoiceId },
            data: invData,
          });
        } else {
          const inv = await tx.invoice.create({
            data: {
              ...invData,
              createdById: userId,
            },
          });
          await tx.manufacturingOrderManufacturer.update({
            where: {
              manufacturingOrderId_manufacturerId: {
                manufacturingOrderId: pid.data.id,
                manufacturerId: pid.data.manufacturerId,
              },
            },
            data: { invoiceId: inv.id },
          });
        }
      }
    });

    const row = await prisma.manufacturingOrderManufacturer.findUnique({
      where: {
        manufacturingOrderId_manufacturerId: {
          manufacturingOrderId: pid.data.id,
          manufacturerId: pid.data.manufacturerId,
        },
      },
      include: { manufacturer: true, invoice: true },
    });
    return NextResponse.json(row);
  } catch (e) {
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
