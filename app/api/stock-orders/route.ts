import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStoreContext } from "@/lib/store-context";
import {
  purchaseOrderStatusSchema,
  stockOrderCreateSchema,
} from "@/lib/validations/purchase-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import type { Prisma } from "@/app/generated/prisma/client";
import { purchaseOrderDetailInclude } from "@/lib/purchase-order-include";
import { PURCHASE_ORDER_TYPE_STOCK } from "@/lib/purchase-order-type";
import { purchaseOrderDetailFromPrisma } from "@/lib/shipping-api";
import { productPricingSnapshot } from "@/lib/purchase-order-line-pricing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get("status");
  const q = searchParams.get("q")?.trim() ?? "";
  const manufacturerIdRaw = searchParams.get("manufacturerId");

  const where: Prisma.PurchaseOrderWhereInput = {
    storeId,
    type: PURCHASE_ORDER_TYPE_STOCK,
  };
  if (statusRaw) {
    const st = purchaseOrderStatusSchema.safeParse(statusRaw);
    if (st.success) where.status = st.data;
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
      saleChannel: {
        select: {
          id: true,
          name: true,
          type: true,
          logoKey: true,
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
      saleChannel: r.saleChannel,
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
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = stockOrderCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const { name, documentKey, saleChannelId, lines } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const productPricingById = new Map<string, { cost: unknown; price: unknown }>();
      if (lines.length > 0) {
        const pIds = [...new Set(lines.map((l) => l.productId))];
        const products = await tx.product.findMany({
          where: { id: { in: pIds }, storeId },
          select: { id: true, cost: true, price: true },
        });
        if (products.length !== pIds.length) {
          throw new Error("PRODUCT_NOT_FOUND");
        }
        for (const product of products) {
          productPricingById.set(product.id, product);
        }
      }

      const sc = await tx.saleChannel.findFirst({
        where: { id: saleChannelId, storeId },
        select: { id: true },
      });
      if (!sc) throw new Error("SALE_CHANNEL_NOT_FOUND");

      const po = await tx.purchaseOrder.create({
        data: {
          name,
          type: PURCHASE_ORDER_TYPE_STOCK,
          documentKey: documentKey ?? null,
          storeId,
          saleChannelId,
          createdById: userId,
        },
      });

      for (const line of lines) {
        const productPricing = productPricingById.get(line.productId);
        if (!productPricing) {
          throw new Error("PRODUCT_NOT_FOUND");
        }
        await tx.purchaseOrderLine.create({
          data: {
            purchaseOrderId: po.id,
            productId: line.productId,
            storeId,
            createdById: userId,
            ...productPricingSnapshot(productPricing),
            quantity: line.quantity,
            orderedQuantity: line.quantity,
          },
        });
      }

      return po.id;
    });

    const full = await prisma.purchaseOrder.findFirst({
      where: {
        id: result,
        storeId,
        type: PURCHASE_ORDER_TYPE_STOCK,
      },
      include: purchaseOrderDetailInclude,
    });
    return NextResponse.json(full ? purchaseOrderDetailFromPrisma(full) : null, {
      status: 201,
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "PRODUCT_NOT_FOUND") {
        return jsonError("One or more products were not found", 400);
      }
      if (e.message === "SALE_CHANNEL_NOT_FOUND") {
        return jsonError("Sale channel not found", 400);
      }
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
