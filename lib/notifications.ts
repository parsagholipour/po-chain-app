import "server-only";

import type {
  NotificationAudience,
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createPurchaseOrderPdfEmailLink,
  type PurchaseOrderPdfEmailLink,
} from "@/lib/po/purchase-order-pdf";
import { APP_NAME } from "@/lib/app-name";
import { EmailService } from "@/lib/services/email";

const MAX_EMAIL_ATTEMPTS = 5;
const DEFAULT_DISPATCH_LIMIT = 50;

export type NotificationEmailRecipient = {
  email?: string | null;
  name?: string | null;
  missingReason?: string;
};

export type CreateNotificationInput = {
  type: NotificationType;
  priority?: NotificationPriority;
  audience: NotificationAudience;
  title: string;
  body: string;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey: string;
  data?: Prisma.InputJsonValue;
  saleChannelId?: string | null;
  storeId: string;
  createdById?: string | null;
  emailRecipients?: NotificationEmailRecipient[];
};

export type CreateNotificationResult = {
  id: string;
  created: boolean;
};

type NotificationTx = Prisma.TransactionClient;

function isSystemGeneratedEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith("@po-app.local") || normalized.endsWith("@keycloak.local");
}

function preferredEmail(...emails: Array<string | null | undefined>) {
  for (const email of emails) {
    const trimmed = email?.trim();
    if (trimmed && !isSystemGeneratedEmail(trimmed)) return trimmed;
  }
  return null;
}

function preferredName(...names: Array<string | null | undefined>) {
  for (const name of names) {
    const trimmed = name?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function uniqueEmailRecipients(
  recipients: NotificationEmailRecipient[],
  missingReason: string,
) {
  const seen = new Set<string>();
  const unique: NotificationEmailRecipient[] = [];

  for (const recipient of recipients) {
    const email = recipient.email?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      email,
      name: recipient.name?.trim() || null,
    });
  }

  return unique.length > 0 ? unique : [{ email: null, missingReason }];
}

export async function createNotification(
  tx: NotificationTx,
  input: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  const existing = await tx.notification.findUnique({
    where: {
      storeId_dedupeKey: {
        storeId: input.storeId,
        dedupeKey: input.dedupeKey,
      },
    },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const notification = await tx.notification.create({
    data: {
      type: input.type,
      priority: input.priority ?? "info",
      audience: input.audience,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      dedupeKey: input.dedupeKey,
      data: input.data ?? undefined,
      saleChannelId: input.saleChannelId ?? null,
      storeId: input.storeId,
      createdById: input.createdById ?? null,
      emailDeliveries: input.emailRecipients?.length
        ? {
            create: input.emailRecipients.map((recipient) => {
              const email = recipient.email?.trim() || null;
              return {
                recipientEmail: email,
                recipientName: recipient.name?.trim() || null,
                status: email ? "pending" : "skipped",
                lastError: email
                  ? null
                  : (recipient.missingReason ?? "Recipient email is missing."),
                storeId: input.storeId,
              };
            }),
          }
        : undefined,
    },
    select: { id: true },
  });

  return { id: notification.id, created: true };
}

export async function storeOwnerEmailRecipient(
  tx: NotificationTx,
  storeId: string,
): Promise<NotificationEmailRecipient> {
  return (await storeOwnerEmailRecipients(tx, storeId))[0];
}

export async function storeOwnerEmailRecipients(
  tx: NotificationTx,
  storeId: string,
): Promise<NotificationEmailRecipient[]> {
  const store = await tx.store.findUnique({
    where: { id: storeId },
    select: {
      name: true,
      email: true,
      userStores: {
        where: { user: { type: "internal" } },
        select: {
          user: {
            select: {
              email: true,
              name: true,
              realEmail: true,
              realName: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const recipients: NotificationEmailRecipient[] = [];
  if (store) {
    recipients.push({
      email: preferredEmail(store.email),
      name: preferredName(store.name),
    });
    recipients.push(
      ...store.userStores.map(({ user }) => ({
        email: preferredEmail(user.realEmail, user.email),
        name: preferredName(user.realName, user.name),
      })),
    );
  }

  return uniqueEmailRecipients(
    recipients,
    "Store.email and internal user emails are missing.",
  );
}

export async function distributorEmailRecipient(
  tx: NotificationTx,
  {
    storeId,
    saleChannelId,
  }: {
    storeId: string;
    saleChannelId: string | null | undefined;
  },
): Promise<NotificationEmailRecipient> {
  return (await distributorEmailRecipients(tx, { storeId, saleChannelId }))[0];
}

export async function distributorEmailRecipients(
  tx: NotificationTx,
  {
    storeId,
    saleChannelId,
  }: {
    storeId: string;
    saleChannelId: string | null | undefined;
  },
): Promise<NotificationEmailRecipient[]> {
  if (!saleChannelId) {
    return [
      {
        email: null,
        missingReason: "Distributor sale channel is missing.",
      },
    ];
  }

  const saleChannel = await tx.saleChannel.findFirst({
    where: { id: saleChannelId, storeId },
    select: {
      name: true,
      email: true,
      loginUser: {
        select: {
          email: true,
          name: true,
          realEmail: true,
          realName: true,
        },
      },
    },
  });
  const recipients: NotificationEmailRecipient[] = [];
  if (saleChannel) {
    recipients.push({
      email: preferredEmail(saleChannel.email),
      name: preferredName(saleChannel.name),
    });
    if (saleChannel.loginUser) {
      recipients.push({
        email: preferredEmail(
          saleChannel.loginUser.realEmail,
          saleChannel.loginUser.email,
        ),
        name: preferredName(saleChannel.loginUser.realName, saleChannel.loginUser.name),
      });
    }
  }

  return uniqueEmailRecipients(
    recipients,
    "SaleChannel.email and distributor login user email are missing.",
  );
}

export async function dispatchNotificationEmails({
  notificationIds,
  limit = DEFAULT_DISPATCH_LIMIT,
}: {
  notificationIds?: string[];
  limit?: number;
} = {}) {
  const now = new Date();
  const normalizedNotificationIds = notificationIds
    ? [...new Set(notificationIds)].filter(Boolean)
    : undefined;
  if (normalizedNotificationIds && normalizedNotificationIds.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const deliveries = await prisma.notificationEmailDelivery.findMany({
    where: {
      ...(normalizedNotificationIds
        ? { notificationId: { in: normalizedNotificationIds } }
        : {}),
      recipientEmail: { not: null },
      status: { in: ["pending", "failed"] },
      attemptCount: { lt: MAX_EMAIL_ATTEMPTS },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    include: {
      notification: {
        select: {
          id: true,
          title: true,
          body: true,
          href: true,
          type: true,
          audience: true,
          entityType: true,
          entityId: true,
          storeId: true,
          store: { select: { name: true } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    if (!delivery.recipientEmail) continue;

    try {
      const pdfLink = await purchaseOrderPdfLinkForNotification(delivery.notification);
      const message = notificationEmailMessage({
        to: {
          email: delivery.recipientEmail,
          name: delivery.recipientName ?? undefined,
        },
        notification: delivery.notification,
        pdfLink,
      });
      const result = await EmailService.send(message);
      await prisma.notificationEmailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "sent",
          attemptCount: { increment: 1 },
          sentAt: new Date(),
          messageId: result.messageId ?? null,
          nextAttemptAt: null,
          lastError: null,
        },
      });
      sent += 1;
    } catch (error) {
      const nextAttemptCount = delivery.attemptCount + 1;
      await prisma.notificationEmailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "failed",
          attemptCount: nextAttemptCount,
          nextAttemptAt:
            nextAttemptCount >= MAX_EMAIL_ATTEMPTS
              ? null
              : nextRetryAt(nextAttemptCount),
          lastError: error instanceof Error ? error.message : "Email delivery failed.",
        },
      });
      failed += 1;
    }
  }

  return { sent, failed, skipped: 0 };
}

export async function dispatchNotificationEmailsSafely(notificationIds: string[]) {
  if (notificationIds.length === 0) return;
  try {
    await dispatchNotificationEmails({ notificationIds });
  } catch (error) {
    console.error("[notifications] email dispatch failed", error);
  }
}

function nextRetryAt(attemptCount: number) {
  const minutesByAttempt = [1, 5, 15, 60];
  const minutes = minutesByAttempt[Math.min(attemptCount - 1, minutesByAttempt.length - 1)];
  return new Date(Date.now() + minutes * 60_000);
}

function notificationEmailMessage({
  to,
  notification,
  pdfLink,
}: {
  to: { email: string; name?: string };
  notification: {
    title: string;
    body: string;
    href: string | null;
    store: { name: string };
  };
  pdfLink?: PurchaseOrderPdfEmailLink | null;
}) {
  const actionUrl = notification.href ? absoluteAppUrl(notification.href) : null;
  const text = [
    notification.body,
    pdfLink ? `Purchase order PDF: ${pdfLink.url}` : null,
    "",
    actionUrl ? `Open in ${APP_NAME}: ${actionUrl}` : null,
  ]
    .filter((line): line is string => line != null)
    .join("\n");

  const html = [
    `<p>${escapeHtml(notification.body)}</p>`,
    pdfLink
      ? `<p><strong>Attachment:</strong> <a href="${escapeHtml(pdfLink.url)}">${escapeHtml(pdfLink.filename)}</a></p>`
      : "",
    actionUrl
      ? `<p><a href="${escapeHtml(actionUrl)}">Open in ${escapeHtml(APP_NAME)}</a></p>`
      : "",
  ].join("");

  return {
    to,
    subject: `[${notification.store.name}] ${notification.title}`,
    text,
    html,
    categories: ["notification"],
    customArgs: {
      notificationType: "notification",
    },
  };
}

async function purchaseOrderPdfLinkForNotification(notification: {
  type: string;
  entityType: string | null;
  entityId: string | null;
  storeId: string;
}): Promise<PurchaseOrderPdfEmailLink | null> {
  if (
    notification.entityType !== "purchase_order" ||
    !notification.entityId ||
    (notification.type !== "purchase_order_created" &&
      notification.type !== "external_order_created")
  ) {
    return null;
  }

  return createPurchaseOrderPdfEmailLink({
    purchaseOrderId: notification.entityId,
    storeId: notification.storeId,
  });
}

function absoluteAppUrl(href: string) {
  if (/^https?:\/\//i.test(href)) return href;
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    process.env.APP_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:4000");
  return `${base}${href.startsWith("/") ? href : `/${href}`}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
