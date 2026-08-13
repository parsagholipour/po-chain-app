import "server-only";

import { Prisma, type OperatorWarningType } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { PURCHASE_ORDER_TYPE_DISTRIBUTOR } from "@/lib/purchase-order-type";
import {
  manufacturingOrderHref,
  parseCompositeEntityId,
  productHref,
  purchaseOrderHref,
  skuLabel,
  warningFingerprint,
  type WarningFinding,
} from "@/lib/operator-warnings/finding";

const STALE_TRANSIT_MS = 14 * 24 * 60 * 60 * 1000;
const productNotDiscontinued = { not: "discontinued" as const };

export type WarningCheck = {
  type: OperatorWarningType;
  scan: (storeId: string) => Promise<WarningFinding[]>;
  evaluate: (storeId: string, entityId: string) => Promise<WarningFinding | null>;
};

function productFinding(
  type: WarningFinding["type"],
  tier: WarningFinding["tier"],
  product: { id: string; name: string; sku: string },
  message: string,
): WarningFinding {
  return {
    type,
    tier,
    entityType: "product",
    entityId: product.id,
    title: product.name,
    message,
    href: productHref(product.id),
  };
}

async function scanBlankSkuProducts(storeId: string) {
  return prisma.$queryRaw<Array<{ id: string; name: string; sku: string }>>(Prisma.sql`
    SELECT id, name, sku
    FROM "Product"
    WHERE "storeId" = ${storeId}::uuid
      AND "editingStatus" <> 'discontinued'
      AND btrim("sku") = ''
  `);
}

const productMissingSku: WarningCheck = {
  type: "product_missing_sku",
  async scan(storeId) {
    const rows = await scanBlankSkuProducts(storeId);
    return rows.map((product) =>
      productFinding(
        "product_missing_sku",
        "high",
        product,
        `${product.name} has a blank SKU.`,
      ),
    );
  },
  async evaluate(storeId, entityId) {
    const product = await prisma.product.findFirst({
      where: { id: entityId, storeId, editingStatus: productNotDiscontinued },
      select: { id: true, name: true, sku: true },
    });
    if (!product || product.sku.trim() !== "") return null;
    return productFinding(
      "product_missing_sku",
      "high",
      product,
      `${product.name} has a blank SKU.`,
    );
  },
};

const productMissingWholesale: WarningCheck = {
  type: "product_missing_wholesale",
  async scan(storeId) {
    const rows = await prisma.product.findMany({
      where: { storeId, editingStatus: productNotDiscontinued, price: null },
      select: { id: true, name: true, sku: true },
    });
    return rows.map((product) =>
      productFinding(
        "product_missing_wholesale",
        "high",
        product,
        `${product.name} (${skuLabel(product.sku)}) is missing a wholesale price.`,
      ),
    );
  },
  async evaluate(storeId, entityId) {
    const product = await prisma.product.findFirst({
      where: { id: entityId, storeId, editingStatus: productNotDiscontinued, price: null },
      select: { id: true, name: true, sku: true },
    });
    if (!product) return null;
    return productFinding(
      "product_missing_wholesale",
      "high",
      product,
      `${product.name} (${skuLabel(product.sku)}) is missing a wholesale price.`,
    );
  },
};

const productMissingCost: WarningCheck = {
  type: "product_missing_cost",
  async scan(storeId) {
    const rows = await prisma.product.findMany({
      where: { storeId, editingStatus: productNotDiscontinued, cost: null },
      select: { id: true, name: true, sku: true },
    });
    return rows.map((product) =>
      productFinding(
        "product_missing_cost",
        "medium",
        product,
        `${product.name} (${skuLabel(product.sku)}) is missing a cost.`,
      ),
    );
  },
  async evaluate(storeId, entityId) {
    const product = await prisma.product.findFirst({
      where: { id: entityId, storeId, editingStatus: productNotDiscontinued, cost: null },
      select: { id: true, name: true, sku: true },
    });
    if (!product) return null;
    return productFinding(
      "product_missing_cost",
      "medium",
      product,
      `${product.name} (${skuLabel(product.sku)}) is missing a cost.`,
    );
  },
};

const productUnverified: WarningCheck = {
  type: "product_unverified",
  async scan(storeId) {
    const rows = await prisma.product.findMany({
      where: { storeId, editingStatus: productNotDiscontinued, verified: false },
      select: { id: true, name: true, sku: true },
    });
    return rows.map((product) =>
      productFinding(
        "product_unverified",
        "low",
        product,
        `${product.name} (${skuLabel(product.sku)}) is not verified.`,
      ),
    );
  },
  async evaluate(storeId, entityId) {
    const product = await prisma.product.findFirst({
      where: { id: entityId, storeId, editingStatus: productNotDiscontinued, verified: false },
      select: { id: true, name: true, sku: true },
    });
    if (!product) return null;
    return productFinding(
      "product_unverified",
      "low",
      product,
      `${product.name} (${skuLabel(product.sku)}) is not verified.`,
    );
  },
};

const poLineSelect = {
  id: true,
  purchaseOrder: { select: { id: true, number: true, type: true } },
  product: { select: { name: true } },
} as const;

function poLineFinding(
  type: Extract<OperatorWarningType, "po_line_missing_cost" | "po_line_missing_price">,
  tier: WarningFinding["tier"],
  row: {
    id: string;
    purchaseOrder: { id: string; number: number; type: "distributor" | "stock" };
    product: { name: string };
  },
  missingField: string,
): WarningFinding {
  return {
    type,
    tier,
    entityType: "purchase_order_line",
    entityId: row.id,
    title: `PO #${row.purchaseOrder.number}`,
    message: `${row.product.name} on PO #${row.purchaseOrder.number} is missing ${missingField}.`,
    href: purchaseOrderHref(row.purchaseOrder.type, row.purchaseOrder.id),
  };
}

const poLineMissingCost: WarningCheck = {
  type: "po_line_missing_cost",
  async scan(storeId) {
    const rows = await prisma.purchaseOrderLine.findMany({
      where: {
        storeId,
        unitCost: null,
        purchaseOrder: { isBackOrder: false },
      },
      select: poLineSelect,
    });
    return rows.map((row) => poLineFinding("po_line_missing_cost", "high", row, "unit cost"));
  },
  async evaluate(storeId, entityId) {
    const row = await prisma.purchaseOrderLine.findFirst({
      where: {
        id: entityId,
        storeId,
        unitCost: null,
        purchaseOrder: { isBackOrder: false },
      },
      select: poLineSelect,
    });
    if (!row) return null;
    return poLineFinding("po_line_missing_cost", "high", row, "unit cost");
  },
};

const poLineMissingPrice: WarningCheck = {
  type: "po_line_missing_price",
  async scan(storeId) {
    const rows = await prisma.purchaseOrderLine.findMany({
      where: {
        storeId,
        unitPrice: null,
        purchaseOrder: { isBackOrder: false },
      },
      select: poLineSelect,
    });
    return rows.map((row) => poLineFinding("po_line_missing_price", "medium", row, "unit price"));
  },
  async evaluate(storeId, entityId) {
    const row = await prisma.purchaseOrderLine.findFirst({
      where: {
        id: entityId,
        storeId,
        unitPrice: null,
        purchaseOrder: { isBackOrder: false },
      },
      select: poLineSelect,
    });
    if (!row) return null;
    return poLineFinding("po_line_missing_price", "medium", row, "unit price");
  },
};

const moAllocationSelect = {
  manufacturingOrderId: true,
  purchaseOrderLineId: true,
  manufacturingOrder: { select: { number: true } },
  purchaseOrderLine: { select: { product: { select: { name: true } } } },
} as const;

function moAllocationFinding(
  type: Extract<OperatorWarningType, "mo_line_missing_cost" | "mo_allocation_unverified">,
  tier: WarningFinding["tier"],
  row: {
    manufacturingOrderId: string;
    purchaseOrderLineId: string;
    manufacturingOrder: { number: number };
    purchaseOrderLine: { product: { name: string } };
  },
  messageSuffix: string,
): WarningFinding {
  const entityId = `${row.manufacturingOrderId}:${row.purchaseOrderLineId}`;
  return {
    type,
    tier,
    entityType: "mo_allocation",
    entityId,
    title: `MO #${row.manufacturingOrder.number}`,
    message: `${row.purchaseOrderLine.product.name} on MO #${row.manufacturingOrder.number} ${messageSuffix}.`,
    href: manufacturingOrderHref(row.manufacturingOrderId),
  };
}

const moLineMissingCost: WarningCheck = {
  type: "mo_line_missing_cost",
  async scan(storeId) {
    const rows = await prisma.manufacturingOrderPurchaseOrderLine.findMany({
      where: { storeId, cost: null },
      select: moAllocationSelect,
    });
    return rows.map((row) =>
      moAllocationFinding("mo_line_missing_cost", "high", row, "is missing manufacturing cost"),
    );
  },
  async evaluate(storeId, entityId) {
    const parsed = parseCompositeEntityId(entityId);
    if (!parsed) return null;
    const row = await prisma.manufacturingOrderPurchaseOrderLine.findFirst({
      where: {
        storeId,
        manufacturingOrderId: parsed.left,
        purchaseOrderLineId: parsed.right,
        cost: null,
      },
      select: moAllocationSelect,
    });
    if (!row) return null;
    return moAllocationFinding("mo_line_missing_cost", "high", row, "is missing manufacturing cost");
  },
};

const moAllocationUnverified: WarningCheck = {
  type: "mo_allocation_unverified",
  async scan(storeId) {
    const rows = await prisma.manufacturingOrderPurchaseOrderLine.findMany({
      where: { storeId, verified: false },
      select: moAllocationSelect,
    });
    return rows.map((row) =>
      moAllocationFinding("mo_allocation_unverified", "medium", row, "is not verified"),
    );
  },
  async evaluate(storeId, entityId) {
    const parsed = parseCompositeEntityId(entityId);
    if (!parsed) return null;
    const row = await prisma.manufacturingOrderPurchaseOrderLine.findFirst({
      where: {
        storeId,
        manufacturingOrderId: parsed.left,
        purchaseOrderLineId: parsed.right,
        verified: false,
      },
      select: moAllocationSelect,
    });
    if (!row) return null;
    return moAllocationFinding("mo_allocation_unverified", "medium", row, "is not verified");
  },
};

const moManufacturerSelect = {
  manufacturingOrderId: true,
  manufacturerId: true,
  manufacturingOrder: { select: { number: true } },
  manufacturer: { select: { name: true } },
} as const;

function moMissingEtaFinding(row: {
  manufacturingOrderId: string;
  manufacturerId: string;
  manufacturingOrder: { number: number };
  manufacturer: { name: string };
}): WarningFinding {
  const entityId = `${row.manufacturingOrderId}:${row.manufacturerId}`;
  return {
    type: "mo_missing_eta",
    tier: "medium",
    entityType: "mo_manufacturer",
    entityId,
    title: `MO #${row.manufacturingOrder.number}`,
    message: `${row.manufacturer.name} on MO #${row.manufacturingOrder.number} has no estimated completion date.`,
    href: manufacturingOrderHref(row.manufacturingOrderId),
  };
}

const moMissingEta: WarningCheck = {
  type: "mo_missing_eta",
  async scan(storeId) {
    const rows = await prisma.manufacturingOrderManufacturer.findMany({
      where: {
        storeId,
        manufacturingStartedAt: { not: null },
        estimatedCompletionAt: null,
      },
      select: moManufacturerSelect,
    });
    return rows.map(moMissingEtaFinding);
  },
  async evaluate(storeId, entityId) {
    const parsed = parseCompositeEntityId(entityId);
    if (!parsed) return null;
    const row = await prisma.manufacturingOrderManufacturer.findFirst({
      where: {
        storeId,
        manufacturingOrderId: parsed.left,
        manufacturerId: parsed.right,
        manufacturingStartedAt: { not: null },
        estimatedCompletionAt: null,
      },
      select: moManufacturerSelect,
    });
    if (!row) return null;
    return moMissingEtaFinding(row);
  },
};

function staleTransitFinding(row: { id: string; number: number; name: string }): WarningFinding {
  return {
    type: "po_stale_in_transit",
    tier: "critical",
    entityType: "purchase_order",
    entityId: row.id,
    title: `PO #${row.number}`,
    message: `PO #${row.number} (${row.name}) has been in transit for more than 14 days.`,
    href: purchaseOrderHref("distributor", row.id),
  };
}

function staleTransitCutoff() {
  return new Date(Date.now() - STALE_TRANSIT_MS);
}

const poStaleInTransit: WarningCheck = {
  type: "po_stale_in_transit",
  async scan(storeId) {
    const rows = await prisma.purchaseOrder.findMany({
      where: {
        storeId,
        type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        isBackOrder: false,
        status: "in_transit",
        updatedAt: { lt: staleTransitCutoff() },
      },
      select: { id: true, number: true, name: true },
    });
    return rows.map(staleTransitFinding);
  },
  async evaluate(storeId, entityId) {
    const row = await prisma.purchaseOrder.findFirst({
      where: {
        id: entityId,
        storeId,
        type: PURCHASE_ORDER_TYPE_DISTRIBUTOR,
        isBackOrder: false,
        status: "in_transit",
        updatedAt: { lt: staleTransitCutoff() },
      },
      select: { id: true, number: true, name: true },
    });
    if (!row) return null;
    return staleTransitFinding(row);
  },
};

export const OPERATOR_WARNING_CHECKS: readonly WarningCheck[] = [
  productMissingSku,
  productMissingWholesale,
  productMissingCost,
  productUnverified,
  poLineMissingCost,
  poLineMissingPrice,
  moLineMissingCost,
  moAllocationUnverified,
  moMissingEta,
  poStaleInTransit,
];

export const OPERATOR_WARNING_CHECK_BY_TYPE = Object.fromEntries(
  OPERATOR_WARNING_CHECKS.map((check) => [check.type, check]),
) as Record<OperatorWarningType, WarningCheck>;

export function findingWithFingerprint(finding: WarningFinding) {
  return {
    ...finding,
    fingerprint: warningFingerprint(finding.type, finding.entityType, finding.entityId),
  };
}
