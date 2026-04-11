import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, requireAppUserId } from "@/lib/session-user";
import {
  purchaseOrderCreateSchema,
  purchaseOrderStatusSchema,
} from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import type { Prisma } from "@/app/generated/prisma/client";
import { purchaseOrderDetailInclude } from "@/lib/purchase-order-include";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import { purchaseOrderDetailFromPrisma } from "@/lib/shipping-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get("status");
  const q = searchParams.get("q")?.trim() ?? "";
  const saleChannelIdRaw = searchParams.get("saleChannelId");
  const manufacturerIdRaw = searchParams.get("manufacturerId");

  const where: Prisma.PurchaseOrderWhereInput = { type: PURCHASE_ORDER_TYPE_DISTRIBUTOR };
  if (statusRaw) {
    const st = purchaseOrderStatusSchema.safeParse(statusRaw);
    if (st.success) where.status = st.data;
  }
  const scParsed = saleChannelIdRaw ? z.uuid().safeParse(saleChannelIdRaw) : null;
  if (scParsed?.success) {
    where.saleChannelId = scParsed.data;
  }
  const mfParsed = manufacturerIdRaw ? z.uuid().safeParse(manufacturerIdRaw) : null;
  if (mfParsed?.success) {
    where.lines = {
      some: {
        manufacturingOrderLines: { some: { manufacturerId: mfParsed.data } },
      },
    };
  }
  if (q.length > 0) {
    const num = Number.parseInt(q, 10);
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      ...(Number.isFinite(num) ? [{ number: num }] : []),
    ];
  }

  const rows = await prisma.purchaseOrder.findMany({
    where,
    orderBy: { number: "desc" },
    select: {
      id: true,
      number: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      lines: {
        select: {
          manufacturingOrderLines: {
            select: {
              manufacturerId: true,
            },
            take: 1,
          },
        },
      },
      purchaseOrderShippings: {
        select: {
          shipping: {
            select: {
              id: true,
              status: true,
              type: true,
              trackingNumber: true,
            },
          },
        },
      },
    },
  });
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
      status: r.status,
      createdAt: r.createdAt,
      manufacturers: Array.from(
        new Set(
          r.lines
            .flatMap((line) => line.manufacturingOrderLines.map((mol) => mol.manufacturerId))
            .filter((id): id is string => id != null)
        )
      ).map((manufacturerId) => ({
        manufacturerId,
        name: "",
        status: "",
      })),
      shippingBadges: r.purchaseOrderShippings.map((s) => ({
        id: s.shipping.id,
        status: s.shipping.status,
        type: s.shipping.type,
        trackingNumber: s.shipping.trackingNumber,
      })),
    })),
  );
}

export async function POST(request: Request) {
  const authz = await requireAppUserId();
  if (!authz.ok) return authz.response;
  const userId = authz.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = purchaseOrderCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const { name, documentKey, saleChannelId, lines } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sc = await tx.saleChannel.findUnique({ where: { id: saleChannelId } });
      if (!sc) {
        throw new Error("SALE_CHANNEL_NOT_FOUND");
      }

      if (lines.length > 0) {
        const pIds = [...new Set(lines.map((l) => l.productId))];
        const pCount = await tx.product.count({ where: { id: { in: pIds } } });
        if (pCount !== pIds.length) {
          throw new Error("PRODUCT_NOT_FOUND");
        }
      }

      const po = await tx.purchaseOrder.create({
        data: {
          name,
          type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
          documentKey: documentKey ?? null,
          saleChannelId,
          createdById: userId,
        },
      });

      for (const line of lines) {
        await tx.purchaseOrderLine.create({
          data: {
            purchaseOrderId: po.id,
            productId: line.productId,
            quantity: line.quantity,
            createdById: userId,
          },
        });
      }

      return po.id;
    });

    const full = await prisma.purchaseOrder.findUnique({
      where: { id: result },
      include: purchaseOrderDetailInclude,
    });
    return NextResponse.json(full ? purchaseOrderDetailFromPrisma(full) : null, {
      status: 201,
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "SALE_CHANNEL_NOT_FOUND") {
        return jsonError("Sale channel was not found", 400);
      }
      if (e.message === "PRODUCT_NOT_FOUND") {
        return jsonError("One or more products were not found", 400);
      }
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
