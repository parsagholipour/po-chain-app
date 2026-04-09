import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUserId, requireAppUserId } from "@/lib/session-user";
import {
  manufacturingOrderCreateSchema,
  manufacturingOrderStatusSchema,
} from "@/lib/validations/manufacturing-order";
import { jsonError, jsonFromPrisma, jsonFromZod } from "@/lib/json-error";
import type { Prisma } from "@/app/generated/prisma/client";
import { manufacturingOrderDetailInclude } from "@/lib/manufacturing-order-include";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get("status");
  const q = searchParams.get("q")?.trim() ?? "";
  const manufacturerIdRaw = searchParams.get("manufacturerId");

  const where: Prisma.ManufacturingOrderWhereInput = {};
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
    },
  });
  return NextResponse.json(
    rows.map((r) => ({
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
          where: { id: { in: purchaseOrderIds } },
        });
        if (n !== purchaseOrderIds.length) throw new Error("PO_NOT_FOUND");
      }

      type MfStatus = NonNullable<(typeof manufacturers)[number]["status"]> | undefined;
      const manufacturerById = new Map<string, { status?: MfStatus }>();
      for (const m of manufacturers) {
        manufacturerById.set(m.manufacturerId, { status: m.status });
      }

      let poLines: { id: string; product: { defaultManufacturerId: string } }[] = [];
      if (purchaseOrderIds.length > 0) {
        poLines = await tx.purchaseOrderLine.findMany({
          where: { purchaseOrderId: { in: purchaseOrderIds } },
          select: {
            id: true,
            product: { select: { defaultManufacturerId: true } },
          },
        });
        for (const line of poLines) {
          const dm = line.product.defaultManufacturerId;
          if (!manufacturerById.has(dm)) {
            manufacturerById.set(dm, { status: undefined });
          }
        }
      }

      const mergedManufacturerIds = [...manufacturerById.keys()];
      if (mergedManufacturerIds.length > 0) {
        const n = await tx.manufacturer.count({ where: { id: { in: mergedManufacturerIds } } });
        if (n !== mergedManufacturerIds.length) throw new Error("MANUFACTURER_NOT_FOUND");
      }

      const mo = await tx.manufacturingOrder.create({
        data: {
          name,
          documentKey: documentKey ?? null,
          status: status ?? "open",
          createdById: userId,
        },
      });

      for (const poId of purchaseOrderIds) {
        await tx.manufacturingOrderPurchaseOrder.create({
          data: { manufacturingOrderId: mo.id, purchaseOrderId: poId },
        });
      }
      for (const [manufacturerId, meta] of manufacturerById) {
        await tx.manufacturingOrderManufacturer.create({
          data: {
            manufacturingOrderId: mo.id,
            manufacturerId,
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
            createdById: userId,
          })),
        });
      }

      return mo.id;
    });

    const full = await prisma.manufacturingOrder.findUnique({
      where: { id: result },
      include: manufacturingOrderDetailInclude,
    });
    return NextResponse.json(full, { status: 201 });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "PO_NOT_FOUND") {
        return jsonError("One or more purchase or stock orders were not found", 400);
      }
      if (e.message === "MANUFACTURER_NOT_FOUND") {
        return jsonError("One or more manufacturers were not found", 400);
      }
    }
    const j = jsonFromPrisma(e);
    if (j) return j;
    throw e;
  }
}
