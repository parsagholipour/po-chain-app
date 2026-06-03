import { NextResponse } from "next/server";
import type { CustomFieldDefinition, CustomFieldValue } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const releaseDateFieldKeys = new Set([
  "release_date",
  "release_date_ships_from",
  "release_date_ship_from",
  "ships_from",
  "ship_from",
]);

function normalizeFieldName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isReleaseDateField(definition: CustomFieldDefinition) {
  const key = normalizeFieldName(definition.fieldKey);
  const name = normalizeFieldName(definition.name);

  return (
    releaseDateFieldKeys.has(key) ||
    releaseDateFieldKeys.has(name) ||
    (name.includes("release") && (name.includes("ship") || name.includes("from")))
  );
}

function customFieldValueToDisplay(value: CustomFieldValue | undefined) {
  if (!value) return null;
  if (value.dateValue) return value.dateValue.toISOString();
  if (value.textValue) return value.textValue;
  if (value.numberValue != null) return String(value.numberValue);
  if (value.booleanValue != null) return value.booleanValue ? "Yes" : "No";
  return value.fileKey;
}

export async function GET() {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  const [products, customDefinitions] = await Promise.all([
    prisma.product.findMany({
      where: { storeId, editingStatus: { not: "discontinued" } },
      orderBy: [{ sku: "asc" }, { name: "asc" }],
      select: {
        id: true,
        sku: true,
        name: true,
        upcGtin: true,
        category: { select: { id: true, name: true, createdAt: true, updatedAt: true } },
        collection: { select: { id: true, name: true, createdAt: true, updatedAt: true } },
        msrp: true,
        map: true,
        price: true,
        mop: true,
        imageLink: true,
        imageKey: true,
        barcodeKey: true,
        stockCount: true,
        quantityPerCarton: true,
        description: true,
        orderByDate: true,
        editingStatus: true,
      },
    }),
    prisma.customFieldDefinition.findMany({
      where: { storeId, entityType: "product" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const releaseDateDefinition = customDefinitions.find(isReleaseDateField);
  const releaseDateValues =
    releaseDateDefinition && products.length > 0
      ? await prisma.customFieldValue.findMany({
          where: {
            storeId,
            definitionId: releaseDateDefinition.id,
            entityId: { in: products.map((product) => product.id) },
          },
        })
      : [];
  const releaseDateByProductId = new Map(
    releaseDateValues.map((value) => [value.entityId, customFieldValueToDisplay(value)]),
  );

  return NextResponse.json(
    products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      upcGtin: product.upcGtin,
      category: product.category,
      collection: product.collection,
      msrp: product.msrp,
      map: product.map,
      wholesalePrice: product.price,
      moq: product.mop,
      imageLink: product.imageLink,
      imageKey: product.imageKey,
      barcodeKey: product.barcodeKey,
      stockCount: product.stockCount,
      quantityPerCarton: product.quantityPerCarton,
      description: product.description,
      orderByDate: product.orderByDate,
      releaseDateShipsFrom: releaseDateByProductId.get(product.id) ?? null,
      editionStatus: product.editingStatus,
    })),
  );
}
