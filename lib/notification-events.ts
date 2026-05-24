import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import {
  createNotification,
  distributorEmailRecipient,
  storeOwnerEmailRecipient,
} from "@/lib/notifications";
import {
  distributorPoStatusLabels,
  shippingStatusLabels,
} from "@/lib/po/status-labels";

type NotificationTx = Prisma.TransactionClient;

type PurchaseOrderNotificationRef = {
  id: string;
  number: number;
  name: string;
  saleChannelId: string | null;
  isBackOrder?: boolean;
};

type ShippingPurchaseOrderRef = PurchaseOrderNotificationRef & {
  saleChannel: { id: string; name: string; email: string | null } | null;
};

type ShippingNotificationOrderTargets = {
  purchaseOrderIds?: string[];
  manufacturingOrderIds?: string[];
  warehouseOrderIds?: string[];
};

function poLabel(po: { number: number; name: string }) {
  return `PO #${po.number} - ${po.name}`;
}

function statusLabel(status: string, labels: Record<string, string>) {
  return labels[status] ?? status;
}

function uniqueNotificationIds(ids: string[]) {
  return [...new Set(ids)];
}

async function purchaseOrderIdsForShippingTargets(
  tx: NotificationTx,
  {
    storeId,
    purchaseOrderIds,
    manufacturingOrderIds,
    warehouseOrderIds,
  }: ShippingNotificationOrderTargets & { storeId: string },
) {
  const ids = new Set(purchaseOrderIds ?? []);

  const uniqueManufacturingOrderIds = [...new Set(manufacturingOrderIds ?? [])];
  if (uniqueManufacturingOrderIds.length > 0) {
    const links = await tx.manufacturingOrderPurchaseOrder.findMany({
      where: {
        storeId,
        manufacturingOrderId: { in: uniqueManufacturingOrderIds },
      },
      select: { purchaseOrderId: true },
    });
    for (const link of links) ids.add(link.purchaseOrderId);
  }

  const uniqueWarehouseOrderIds = [...new Set(warehouseOrderIds ?? [])];
  if (uniqueWarehouseOrderIds.length > 0) {
    const links = await tx.warehouseOrderPurchaseOrder.findMany({
      where: {
        storeId,
        warehouseOrderId: { in: uniqueWarehouseOrderIds },
      },
      select: { purchaseOrderId: true },
    });
    for (const link of links) ids.add(link.purchaseOrderId);
  }

  return [...ids];
}

export async function createExternalOrderNotifications(
  tx: NotificationTx,
  {
    storeId,
    createdById,
    purchaseOrder,
  }: {
    storeId: string;
    createdById: string | null;
    purchaseOrder: PurchaseOrderNotificationRef;
  },
) {
  const ids: string[] = [];
  const title = `New ${purchaseOrder.isBackOrder ? "backorder" : "order"} ${poLabel(purchaseOrder)}`;
  const body = `${poLabel(purchaseOrder)} was created from an external order.`;
  const href = `/purchase-orders/${purchaseOrder.id}`;

  const storeOwner = await storeOwnerEmailRecipient(tx, storeId);
  const storeNotification = await createNotification(tx, {
    type: "external_order_created",
    priority: "important",
    audience: "store_owner",
    title,
    body,
    href,
    entityType: "purchase_order",
    entityId: purchaseOrder.id,
    dedupeKey: `external-order:store-owner:po:${purchaseOrder.id}`,
    storeId,
    createdById,
    emailRecipients: [storeOwner],
  });
  ids.push(storeNotification.id);

  if (purchaseOrder.saleChannelId) {
    const distributor = await distributorEmailRecipient(tx, {
      storeId,
      saleChannelId: purchaseOrder.saleChannelId,
    });
    const distributorNotification = await createNotification(tx, {
      type: "external_order_created",
      priority: "important",
      audience: "distributor",
      title: `Order received: ${poLabel(purchaseOrder)}`,
      body: `${poLabel(purchaseOrder)} was received and is now open.`,
      href,
      entityType: "purchase_order",
      entityId: purchaseOrder.id,
      dedupeKey: `external-order:distributor:po:${purchaseOrder.id}`,
      saleChannelId: purchaseOrder.saleChannelId,
      storeId,
      createdById,
      emailRecipients: [distributor],
    });
    ids.push(distributorNotification.id);
  }

  return uniqueNotificationIds(ids);
}

export async function createManualPurchaseOrderNotification(
  tx: NotificationTx,
  {
    storeId,
    createdById,
    purchaseOrder,
  }: {
    storeId: string;
    createdById: string;
    purchaseOrder: PurchaseOrderNotificationRef;
  },
) {
  const storeOwner = await storeOwnerEmailRecipient(tx, storeId);
  const notification = await createNotification(tx, {
    type: "purchase_order_created",
    priority: "info",
    audience: "store_owner",
    title: `Purchase order created: ${poLabel(purchaseOrder)}`,
    body: `${poLabel(purchaseOrder)} was created manually.`,
    href: `/purchase-orders/${purchaseOrder.id}`,
    entityType: "purchase_order",
    entityId: purchaseOrder.id,
    dedupeKey: `manual-po-created:store-owner:${purchaseOrder.id}`,
    storeId,
    createdById,
    emailRecipients: [storeOwner],
  });
  return [notification.id];
}

export async function createPaymentStatusNotifications(
  tx: NotificationTx,
  {
    storeId,
    invoiceId,
    providerEventId,
    paymentStatus,
  }: {
    storeId: string;
    invoiceId: string;
    providerEventId: string;
    paymentStatus: "failed" | "cancelled";
  },
) {
  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, storeId, purpose: "distributor_order" },
    select: {
      id: true,
      invoiceNumber: true,
      draftPurchaseOrders: {
        select: {
          saleChannelId: true,
          saleChannel: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!invoice) return [];

  const ids: string[] = [];
  const statusWord = paymentStatus === "failed" ? "failed" : "was cancelled";
  const notificationType = paymentStatus === "failed" ? "payment_failed" : "payment_cancelled";
  const storeOwner = await storeOwnerEmailRecipient(tx, storeId);

  const storeNotification = await createNotification(tx, {
    type: notificationType,
    priority: "urgent",
    audience: "store_owner",
    title: `Payment ${statusWord}`,
    body: `Payment ${statusWord} for external order invoice ${invoice.invoiceNumber}.`,
    href: "/purchase-orders-overview",
    entityType: "invoice",
    entityId: invoice.id,
    dedupeKey: `payment:${paymentStatus}:store-owner:${providerEventId}`,
    storeId,
    emailRecipients: [storeOwner],
  });
  ids.push(storeNotification.id);

  const saleChannels = new Map(
    invoice.draftPurchaseOrders
      .filter((draft) => draft.saleChannel)
      .map((draft) => [draft.saleChannelId, draft.saleChannel!]),
  );

  for (const saleChannel of saleChannels.values()) {
    const distributor = await distributorEmailRecipient(tx, {
      storeId,
      saleChannelId: saleChannel.id,
    });
    const notification = await createNotification(tx, {
      type: notificationType,
      priority: "urgent",
      audience: "distributor",
      title: `Payment ${statusWord}`,
      body: `Payment ${statusWord} for invoice ${invoice.invoiceNumber}.`,
      href: `/new-order/success?invoiceId=${invoice.id}`,
      entityType: "invoice",
      entityId: invoice.id,
      dedupeKey: `payment:${paymentStatus}:distributor:${saleChannel.id}:${providerEventId}`,
      saleChannelId: saleChannel.id,
      storeId,
      emailRecipients: [distributor],
    });
    ids.push(notification.id);
  }

  return uniqueNotificationIds(ids);
}

export async function createPurchaseOrderStatusNotification(
  tx: NotificationTx,
  {
    storeId,
    createdById,
    purchaseOrder,
    toStatus,
    statusLogId,
  }: {
    storeId: string;
    createdById: string;
    purchaseOrder: PurchaseOrderNotificationRef;
    toStatus: "in_transit" | "invoiced" | "closed";
    statusLogId: string;
  },
) {
  if (!purchaseOrder.saleChannelId) return [];

  const label = statusLabel(toStatus, distributorPoStatusLabels);
  const distributor = await distributorEmailRecipient(tx, {
    storeId,
    saleChannelId: purchaseOrder.saleChannelId,
  });
  const notification = await createNotification(tx, {
    type: "po_status_changed",
    priority: "important",
    audience: "distributor",
    title: `${poLabel(purchaseOrder)} is ${label}`,
    body: `${poLabel(purchaseOrder)} moved to ${label}.`,
    href: `/purchase-orders/${purchaseOrder.id}`,
    entityType: "purchase_order",
    entityId: purchaseOrder.id,
    dedupeKey: `po-status:distributor:${statusLogId}`,
    saleChannelId: purchaseOrder.saleChannelId,
    storeId,
    createdById,
    emailRecipients: [distributor],
  });
  return [notification.id];
}

export async function createShippingStatusNotifications(
  tx: NotificationTx,
  {
    storeId,
    createdById,
    shippingId,
    trackingNumber,
    toStatus,
    statusLogId,
    purchaseOrderIds,
    manufacturingOrderIds,
    warehouseOrderIds,
  }: {
    storeId: string;
    createdById: string;
    shippingId: string;
    trackingNumber: string;
    toStatus: "in_transit" | "delivered" | "cancelled";
    statusLogId?: string;
  } & ShippingNotificationOrderTargets,
) {
  const uniquePurchaseOrderIds = await purchaseOrderIdsForShippingTargets(tx, {
    storeId,
    purchaseOrderIds,
    manufacturingOrderIds,
    warehouseOrderIds,
  });
  if (uniquePurchaseOrderIds.length === 0) return [];

  const purchaseOrders = await tx.purchaseOrder.findMany({
    where: {
      id: { in: uniquePurchaseOrderIds },
      storeId,
      type: "distributor",
      isBackOrder: false,
    },
    select: {
      id: true,
      number: true,
      name: true,
      saleChannelId: true,
      saleChannel: { select: { id: true, name: true, email: true } },
    },
  });

  const ids: string[] = [];
  const label = statusLabel(toStatus, shippingStatusLabels);
  for (const po of purchaseOrders as ShippingPurchaseOrderRef[]) {
    if (!po.saleChannelId) continue;
    const distributor = await distributorEmailRecipient(tx, {
      storeId,
      saleChannelId: po.saleChannelId,
    });
    const notification = await createNotification(tx, {
      type: "shipment_status_changed",
      priority: "important",
      audience: "distributor",
      title: `Shipment ${label}: ${poLabel(po)}`,
      body: `Shipment ${trackingNumber} for ${poLabel(po)} is ${label}.`,
      href: `/purchase-orders/${po.id}`,
      entityType: "shipping",
      entityId: shippingId,
      dedupeKey: `shipping-status:distributor:${statusLogId ?? shippingId}:${po.id}:${toStatus}`,
      saleChannelId: po.saleChannelId,
      storeId,
      createdById,
      emailRecipients: [distributor],
    });
    ids.push(notification.id);
  }

  return uniqueNotificationIds(ids);
}

export async function createShippingCreatedNotifications(
  tx: NotificationTx,
  {
    storeId,
    createdById,
    shippingId,
    trackingNumber,
    purchaseOrderIds,
    manufacturingOrderIds,
    warehouseOrderIds,
  }: {
    storeId: string;
    createdById: string;
    shippingId: string;
    trackingNumber: string;
  } & ShippingNotificationOrderTargets,
) {
  const uniquePurchaseOrderIds = await purchaseOrderIdsForShippingTargets(tx, {
    storeId,
    purchaseOrderIds,
    manufacturingOrderIds,
    warehouseOrderIds,
  });
  if (uniquePurchaseOrderIds.length === 0) return [];

  const purchaseOrders = await tx.purchaseOrder.findMany({
    where: {
      id: { in: uniquePurchaseOrderIds },
      storeId,
      type: "distributor",
      isBackOrder: false,
    },
    select: {
      id: true,
      number: true,
      name: true,
      saleChannelId: true,
      saleChannel: { select: { id: true, name: true, email: true } },
    },
  });

  const ids: string[] = [];
  for (const po of purchaseOrders as ShippingPurchaseOrderRef[]) {
    if (!po.saleChannelId) continue;
    const distributor = await distributorEmailRecipient(tx, {
      storeId,
      saleChannelId: po.saleChannelId,
    });
    const notification = await createNotification(tx, {
      type: "shipment_status_changed",
      priority: "important",
      audience: "distributor",
      title: `Shipping information for order ${po.name}`,
      body: `Shipping information was added for ${po.name}${
        trackingNumber.trim() ? `: ${trackingNumber.trim()}.` : "."
      }`,
      href: `/purchase-orders/${po.id}`,
      entityType: "shipping",
      entityId: shippingId,
      dedupeKey: `shipping-created:distributor:${shippingId}:${po.id}`,
      saleChannelId: po.saleChannelId,
      storeId,
      createdById,
      emailRecipients: [distributor],
    });
    ids.push(notification.id);
  }

  return uniqueNotificationIds(ids);
}

export async function createBackorderActualizedNotification(
  tx: NotificationTx,
  {
    storeId,
    createdById,
    backorder,
    actualizedPurchaseOrder,
  }: {
    storeId: string;
    createdById: string;
    backorder: PurchaseOrderNotificationRef;
    actualizedPurchaseOrder: PurchaseOrderNotificationRef;
  },
) {
  if (!backorder.saleChannelId) return [];

  const distributor = await distributorEmailRecipient(tx, {
    storeId,
    saleChannelId: backorder.saleChannelId,
  });
  const notification = await createNotification(tx, {
    type: "backorder_actualized",
    priority: "important",
    audience: "distributor",
    title: `Backorder actualized: ${poLabel(actualizedPurchaseOrder)}`,
    body: `${poLabel(backorder)} was actualized as ${poLabel(actualizedPurchaseOrder)}.`,
    href: `/purchase-orders/${actualizedPurchaseOrder.id}`,
    entityType: "purchase_order",
    entityId: actualizedPurchaseOrder.id,
    dedupeKey: `backorder-actualized:distributor:${backorder.id}:${actualizedPurchaseOrder.id}`,
    saleChannelId: backorder.saleChannelId,
    storeId,
    createdById,
    emailRecipients: [distributor],
  });
  return [notification.id];
}

export async function createPurchaseOrderOsdNotifications(
  tx: NotificationTx,
  {
    storeId,
    createdById,
    osdId,
    purchaseOrder,
    type,
    lineCount,
  }: {
    storeId: string;
    createdById: string;
    osdId: string;
    purchaseOrder: PurchaseOrderNotificationRef;
    type: string;
    lineCount: number;
  },
) {
  const ids: string[] = [];
  const title = `OS&D recorded for ${poLabel(purchaseOrder)}`;
  const body = `${type} OS&D was recorded for ${poLabel(purchaseOrder)} across ${lineCount} line${lineCount === 1 ? "" : "s"}.`;
  const href = `/purchase-orders/${purchaseOrder.id}`;

  const storeOwner = await storeOwnerEmailRecipient(tx, storeId);
  const storeNotification = await createNotification(tx, {
    type: "po_osd_created",
    priority: "urgent",
    audience: "store_owner",
    title,
    body,
    href,
    entityType: "purchase_order_osd",
    entityId: osdId,
    dedupeKey: `po-osd:store-owner:${osdId}`,
    storeId,
    createdById,
    emailRecipients: [storeOwner],
  });
  ids.push(storeNotification.id);

  if (purchaseOrder.saleChannelId) {
    const distributor = await distributorEmailRecipient(tx, {
      storeId,
      saleChannelId: purchaseOrder.saleChannelId,
    });
    const distributorNotification = await createNotification(tx, {
      type: "po_osd_created",
      priority: "urgent",
      audience: "distributor",
      title,
      body,
      href,
      entityType: "purchase_order_osd",
      entityId: osdId,
      dedupeKey: `po-osd:distributor:${osdId}`,
      saleChannelId: purchaseOrder.saleChannelId,
      storeId,
      createdById,
      emailRecipients: [distributor],
    });
    ids.push(distributorNotification.id);
  }

  return uniqueNotificationIds(ids);
}
