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
      // --- status + step-specific fields ---
      const pivotUpdate: Record<string, unknown> = {};

      if (parsed.data.status !== undefined) {
        pivotUpdate.status = parsed.data.status;

        // "NOW" auto-fill: set the timestamp only when it is still null in DB
        const now = new Date();
        const nowMap: Record<string, string> = {
          deposit_paid: "depositPaidAt",
          manufacturing: "manufacturingStartedAt",
          balance_paid: "balancePaidAt",
          ready_to_pickup: "readyAt",
          picked_up: "pickedUpAt",
        };
        const tsField = nowMap[parsed.data.status];
        if (tsField) {
          const current = pivot[tsField as keyof typeof pivot];
          if (current == null) {
            pivotUpdate[tsField] = parsed.data[tsField as keyof typeof parsed.data] ?? now;
          }
        }
      }

      // Merge any explicitly-provided step fields
      const stepFields = [
        "depositPaidAt",
        "depositPaidAmount",
        "depositTrackingNumber",
        "depositDocumentKey",
        "manufacturingStartedAt",
        "balancePaidAt",
        "balancePaidAmount",
        "balanceTrackingNumber",
        "balanceDocumentKey",
        "readyAt",
        "pickedUpAt",
      ] as const;
      for (const f of stepFields) {
        const v = parsed.data[f];
        if (v !== undefined && !(f in pivotUpdate)) {
          pivotUpdate[f] = v === null ? null : (f.endsWith("At") ? new Date(v as string) : v);
        }
      }

      if (Object.keys(pivotUpdate).length > 0) {
        await tx.manufacturingOrderManufacturer.update({
          where: {
            manufacturingOrderId_manufacturerId: {
              manufacturingOrderId: pid.data.id,
              manufacturerId: pid.data.manufacturerId,
            },
          },
          data: pivotUpdate,
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
