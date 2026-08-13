import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import { productShopifySnapshotOmit } from "@/lib/product-shopify-omit";

/**
 * Relations embedded in every public product representation. External services
 * consume products in one call rather than resolving ids against extra
 * endpoints, so manufacturer/category/type/collection ship inline.
 */
export const publicProductInclude = {
  defaultManufacturer: {
    select: { id: true, name: true, region: true, email: true, contactNumber: true },
  },
  category: { select: { id: true, name: true } },
  type: { select: { id: true, name: true } },
  collection: { select: { id: true, name: true } },
} satisfies Prisma.ProductInclude;

export type PublicProductRow = Prisma.ProductGetPayload<{
  include: typeof publicProductInclude;
  omit: typeof productShopifySnapshotOmit;
}>;

type DecimalLike = { toString(): string } | null;

/** Money columns are Decimal(12,2); JSON numbers represent them exactly. */
function toNumber(value: DecimalLike) {
  if (value == null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function named(row: { id: string; name: string } | null) {
  return row ? { id: row.id, name: row.name } : null;
}

export type PublicProduct = ReturnType<typeof serializePublicProduct>;

/**
 * Stable public shape. Internal-only columns (storeId, createdById, storage
 * keys) are deliberately omitted — adding a field is backwards compatible,
 * removing one is not.
 */
export function serializePublicProduct(row: PublicProductRow) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    upcGtin: row.upcGtin,
    description: row.description,
    imageLink: row.imageLink,
    cost: toNumber(row.cost),
    price: toNumber(row.price),
    map: toNumber(row.map),
    msrp: toNumber(row.msrp),
    mop: row.mop,
    quantityPerCarton: row.quantityPerCarton,
    stockCount: row.stockCount,
    orderByDate: toIso(row.orderByDate),
    editingStatus: row.editingStatus,
    verified: row.verified,
    defaultManufacturer: row.defaultManufacturer
      ? {
          id: row.defaultManufacturer.id,
          name: row.defaultManufacturer.name,
          region: row.defaultManufacturer.region,
          email: row.defaultManufacturer.email,
          contactNumber: row.defaultManufacturer.contactNumber,
        }
      : null,
    category: named(row.category),
    type: named(row.type),
    collection: named(row.collection),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
