import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStoreContext } from "@/lib/store-context";
import {
  manufacturingOrderCreateSchema,
  manufacturingOrderStatusSchema,
} from "@/lib/validations/manufacturing-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import type { Prisma } from "@/app/generated/prisma/client";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";
import {
  findLinesMissingProductAssets,
  formatMissingProductAssetsError,
} from "@/lib/mo-product-assets";
import { manufacturingOrderDetailFromPrisma } from "@/lib/shipping-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get("status");
  const q = searchParams.get("q")?.trim() ?? "";
  const manufacturerIdRaw = searchParams.get("manufacturerId");

  const where: Prisma.ManufacturingOrderWhereInput = { storeId };
  if (statusRaw) {
    const st = manufacturingOrderStatusSchema.safeParse(statusRaw);
    if (st.success) where.status = st.data;
  }
  const mfParsed = manufacturerIdRaw ? z.uuid().safeParse(manufacturerIdRaw) : null;
  if (mfParsed?.success) {
    where.manufacturers = { some: { manufacturerId: mfParsed.data } };
  }
  if (q.length > 0) {
    const num = Number.parseInt(q, 10);
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      ...(Number.isFinite(num) ? [{ number: num }] : []),
    ];
  }

  const rows = await prisma.manufacturingOrder.findMany({
    where,
    orderBy: { number: "desc" },
    select: {
      id: true,
      number: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      manufacturers: {
        select: {
          manufacturerId: true,
          status: true,
          manufacturer: { select: { name: true } },
        },
        orderBy: { manufacturer: { name: "asc" } },
      },
      manufacturingOrderShippings: {
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
      purchaseOrders: {
        select: {
          purchaseOrder: {
            select: {
              id: true,
              number: true,
              name: true,
              type: true,
              saleChannel: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  return NextResponse.json(
    rows.map((r) => {
      const linkedSaleChannels = [
        ...new Set(
          r.purchaseOrders
            .map((p) => p.purchaseOrder.saleChannel?.name)
            .filter((n): n is string => Boolean(n)),
        ),
      ];
      const byPoId = new Map<
        string,
        {
          id: string;
          number: number;
          name: string;
          type: "distributor" | "stock";
          saleChannelName: string | null;
        }
      >();
      for (const p of r.purchaseOrders) {
        const po = p.purchaseOrder;
        byPoId.set(po.id, {
          id: po.id,
          number: po.number,
          name: po.name,
          type: po.type,
          saleChannelName: po.saleChannel?.name ?? null,
        });
      }
      const linkedOrders = [...byPoId.values()]
        .sort((a, b) => {
          const ta = a.type === "distributor" ? 0 : 1;
          const tb = b.type === "distributor" ? 0 : 1;
          if (ta !== tb) return ta - tb;
          return b.number - a.number;
        })
        .map(({ id, name, type, saleChannelName }) => ({
          id,
          name,
          type,
          saleChannelName,
        }));
      return {
        id: r.id,
        number: r.number,
        name: r.name,
        status: r.status,
        createdAt: r.createdAt,
        manufacturers: r.manufacturers.map((m) => ({
          manufacturerId: m.manufacturerId,
          name: m.manufacturer.name,
          status: m.status,
        })),
        shippingBadges: r.manufacturingOrderShippings.map((s) => ({
          id: s.shipping.id,
          status: s.shipping.status,
          type: s.shipping.type,
          trackingNumber: s.shipping.trackingNumber,
        })),
        linkedSaleChannels,
        linkedOrders,
      };
    }),
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

  const parsed = manufacturingOrderCreateSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const { name, documentKey, status, purchaseOrderIds, manufacturers } = parsed.data;

  const mIds = manufacturers.map((m) => m.manufacturerId);
  if (new Set(mIds).size !== mIds.length) {
    return jsonError("Duplicate manufacturer in list", 400);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (purchaseOrderIds.length > 0) {
        const n = await tx.purchaseOrder.count({
          where: { id: { in: purchaseOrderIds }, storeId },
        });
        if (n !== purchaseOrderIds.length) throw new Error("PO_NOT_FOUND");
      }

      type MfStatus = NonNullable<(typeof manufacturers)[number]["status"]> | undefined;
      const manufacturerById = new Map<string, { status?: MfStatus }>();
      for (const m of manufacturers) {
        manufacturerById.set(m.manufacturerId, { status: m.status });
      }

      let poLines: {
        id: string;
        product: {
          defaultManufacturerId: string;
          name: string;
          sku: string;
          barcodeKey: string | null;
          packagingKey: string | null;
          verified: boolean;
        };
        purchaseOrder: { number: number; name: string; type: "distributor" | "stock" };
      }[] = [];
      if (purchaseOrderIds.length > 0) {
        poLines = await tx.purchaseOrderLine.findMany({
          where: { purchaseOrderId: { in: purchaseOrderIds }, storeId },
          select: {
            id: true,
            product: {
              select: {
                defaultManufacturerId: true,
                name: true,
                sku: true,
                barcodeKey: true,
                packagingKey: true,
                verified: true,
              },
            },
            purchaseOrder: {
              select: {
                number: true,
                name: true,
                type: true,
              },
            },
          },
        });
        const missingProductAssets = findLinesMissingProductAssets(poLines);
        if (missingProductAssets.length > 0) {
          throw new Error(
            formatMissingProductAssetsError(
              missingProductAssets,
              "Cannot create this manufacturing order",
            ),
          );
        }
        for (const line of poLines) {
          const dm = line.product.defaultManufacturerId;
          if (!manufacturerById.has(dm)) {
            manufacturerById.set(dm, { status: undefined });
          }
        }
      }

      const mergedManufacturerIds = [...manufacturerById.keys()];
      if (mergedManufacturerIds.length > 0) {
        const n = await tx.manufacturer.count({
          where: { id: { in: mergedManufacturerIds }, storeId },
        });
        if (n !== mergedManufacturerIds.length) throw new Error("MANUFACTURER_NOT_FOUND");
      }

      const mo = await tx.manufacturingOrder.create({
        data: {
          name,
          documentKey: documentKey ?? null,
          status: status ?? "open",
          storeId,
          createdById: userId,
        },
      });

      for (const poId of purchaseOrderIds) {
        await tx.manufacturingOrderPurchaseOrder.create({
          data: {
            manufacturingOrderId: mo.id,
            purchaseOrderId: poId,
            storeId,
          },
        });
      }
      for (const [manufacturerId, meta] of manufacturerById) {
        await tx.manufacturingOrderManufacturer.create({
          data: {
            manufacturingOrderId: mo.id,
            manufacturerId,
            storeId,
            status: meta.status ?? "initial",
            createdById: userId,
          },
        });
      }

      if (poLines.length > 0) {
        await tx.manufacturingOrderPurchaseOrderLine.createMany({
          data: poLines.map((line) => ({
            manufacturingOrderId: mo.id,
            purchaseOrderLineId: line.id,
            manufacturerId: line.product.defaultManufacturerId,
            verified: false,
            storeId,
            createdById: userId,
          })),
        });
      }

      return mo.id;
    });

    const full = await prisma.manufacturingOrder.findFirst({
      where: { id: result, storeId },
      include: manufacturingOrderDetailInclude,
    });
    return NextResponse.json(full ? manufacturingOrderDetailFromPrisma(full) : null, {
      status: 201,
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "PO_NOT_FOUND") {
        return jsonError("One or more purchase or stock orders were not found", 400);
      }
      if (e.message === "MANUFACTURER_NOT_FOUND") {
        return jsonError("One or more manufacturers were not found", 400);
      }
      if (e.message.startsWith("Cannot create this manufacturing order")) {
        return jsonError(e.message, 400);
      }
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
