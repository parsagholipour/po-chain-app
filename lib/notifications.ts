import "server-only";

import imageSize from "image-size";
import type {
  NotificationAudience,
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createDistributorOrderReceivedPdfEmailLink,
  createPurchaseOrderPdfEmailLink,
  type PurchaseOrderPdfEmailLink,
} from "@/lib/po/purchase-order-pdf";
import { APP_NAME } from "@/lib/app-name";
import { EmailService } from "@/lib/services/email";
import {
  getObjectBuffer,
  getPresignedGetUrl,
  parseStoredImageReference,
} from "@/lib/storage";

const MAX_EMAIL_ATTEMPTS = 5;
const DEFAULT_DISPATCH_LIMIT = 50;
const EMAIL_LOGO_URL_EXPIRES_SECONDS = 7 * 24 * 60 * 60;
const EMAIL_LOGO_MAX_WIDTH = 64;
const EMAIL_LOGO_MAX_HEIGHT = 48;

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
    },
  });

  const recipients: NotificationEmailRecipient[] = [];
  if (store) {
    recipients.push({
      email: preferredEmail(store.email),
      name: preferredName(store.name),
    });
  }

  return uniqueEmailRecipients(
    recipients,
    "Store.email is missing.",
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
          store: { select: { name: true, website: true, logoKey: true } },
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
      const [pdfLink, branding] = await Promise.all([
        purchaseOrderPdfLinkForNotification(delivery.notification),
        emailStoreBranding(delivery.notification.store),
      ]);
      const message = notificationEmailMessage({
        to: {
          email: delivery.recipientEmail,
          name: delivery.recipientName ?? undefined,
        },
        notification: delivery.notification,
        pdfLink,
        branding,
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
  branding,
}: {
  to: { email: string; name?: string };
  notification: {
    audience: NotificationAudience;
    title: string;
    body: string;
    href: string | null;
    store: { name: string; website: string | null; logoKey: string | null };
  };
  pdfLink?: PurchaseOrderPdfEmailLink | null;
  branding: NotificationEmailBranding;
}) {
  const actionUrl = notification.href ? absoluteAppUrl(notification.href) : null;
  const actionLabel = notification.audience === "distributor" ? "Distributor portal" : APP_NAME;
  const text = [
    notification.body,
    pdfLink ? `Purchase order PDF: ${pdfLink.url}` : null,
    actionUrl ? `Open in ${actionLabel}: ${actionUrl}` : null,
    "",
    ...notificationEmailFooterTextLines(branding),
  ]
    .filter((line): line is string => line != null)
    .join("\n");

  const html = [
    `<p>${escapeHtml(notification.body)}</p>`,
    pdfLink
      ? `<p><strong>Attachment:</strong> <a href="${escapeHtml(pdfLink.url)}">${escapeHtml(pdfLink.filename)}</a></p>`
      : "",
    actionUrl
      ? `<p><a href="${escapeHtml(actionUrl)}">Open in ${escapeHtml(actionLabel)}</a></p>`
      : "",
    notificationEmailFooterHtml(branding),
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

type NotificationEmailBranding = {
  storeName: string;
  websiteUrl: string | null;
  websiteLabel: string | null;
  logo: NotificationEmailLogo | null;
};

type NotificationEmailLogo = {
  url: string;
  width: number | null;
  height: number | null;
};

async function emailStoreBranding(store: {
  name: string;
  website: string | null;
  logoKey: string | null;
}): Promise<NotificationEmailBranding> {
  const websiteUrl = normalizedWebsiteUrl(store.website);
  return {
    storeName: store.name,
    websiteUrl,
    websiteLabel: websiteUrl ? websiteDisplayLabel(websiteUrl) : null,
    logo: await storeLogo(store.logoKey),
  };
}

async function storeLogo(logoKey: string | null): Promise<NotificationEmailLogo | null> {
  const key = logoKey?.trim();
  if (!key) return null;

  const referenceDimensions = imageDimensionsFromStoredReference(key);

  try {
    const [url, decodedDimensions] = await Promise.all([
      getPresignedGetUrl(key, EMAIL_LOGO_URL_EXPIRES_SECONDS),
      referenceDimensions ? Promise.resolve(referenceDimensions) : storedLogoDimensions(key),
    ]);
    const dimensions = referenceDimensions ?? decodedDimensions;
    return {
      url,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    };
  } catch (error) {
    console.error("[notifications] store logo URL generation failed", error);
    return null;
  }
}

function imageDimensionsFromStoredReference(reference: string) {
  const { width, height } = parseStoredImageReference(reference);
  if (!width || !height || width <= 0 || height <= 0) return null;
  return { width, height };
}

async function storedLogoDimensions(key: string) {
  try {
    const { buffer } = await getObjectBuffer(key);
    return imageDimensionsFromBuffer(buffer);
  } catch (error) {
    console.error("[notifications] store logo dimension detection failed", error);
    return null;
  }
}

function imageDimensionsFromBuffer(buf: Buffer): { width: number; height: number } | null {
  try {
    const result = imageSize(new Uint8Array(buf));
    const width = result.width;
    const height = result.height;
    if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) {
      return { width, height };
    }

    const firstImage = result.images?.[0];
    if (
      firstImage &&
      typeof firstImage.width === "number" &&
      typeof firstImage.height === "number" &&
      firstImage.width > 0 &&
      firstImage.height > 0
    ) {
      return { width: firstImage.width, height: firstImage.height };
    }
  } catch {
    /* not a supported image or buffer too small */
  }
  return null;
}

function notificationEmailFooterTextLines(branding: NotificationEmailBranding) {
  return [
    "--",
    branding.storeName,
    branding.websiteUrl ? `Website: ${branding.websiteUrl}` : null,
  ];
}

function notificationEmailFooterHtml(branding: NotificationEmailBranding) {
  const logoHtml = branding.logo
    ? `<td style="padding:0 14px 0 0;vertical-align:middle;">${notificationEmailLogoHtml(branding.logo, branding.storeName)}</td>`
    : "";
  const websiteHtml = branding.websiteUrl
    ? `<div style="margin-top:2px;font-family:Arial,sans-serif;font-size:12px;line-height:18px;"><a href="${escapeHtml(branding.websiteUrl)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(branding.websiteLabel ?? branding.websiteUrl)}</a></div>`
    : "";

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border-top:1px solid #e5e7eb;"><tr><td style="padding-top:16px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>${logoHtml}<td style="vertical-align:middle;"><div style="font-family:Arial,sans-serif;font-size:13px;line-height:18px;font-weight:700;color:#111827;">${escapeHtml(branding.storeName)}</div>${websiteHtml}</td></tr></table></td></tr></table>`;
}

function notificationEmailLogoHtml(logo: NotificationEmailLogo, storeName: string) {
  const dimensions = fittedEmailLogoDimensions(logo.width, logo.height);
  const sizeAttributes = dimensions
    ? ` width="${dimensions.width}" height="${dimensions.height}"`
    : "";
  const sizeStyles = dimensions
    ? `width:${dimensions.width}px;height:${dimensions.height}px;`
    : "width:auto;height:auto;";

  return `<img src="${escapeHtml(logo.url)}"${sizeAttributes} alt="${escapeHtml(storeName)} logo" style="display:block;${sizeStyles}max-width:${EMAIL_LOGO_MAX_WIDTH}px;max-height:${EMAIL_LOGO_MAX_HEIGHT}px;border:0;border-radius:6px;outline:none;text-decoration:none;">`;
}

function fittedEmailLogoDimensions(width: number | null, height: number | null) {
  if (!width || !height || width <= 0 || height <= 0) return null;

  const scale = Math.min(
    EMAIL_LOGO_MAX_WIDTH / width,
    EMAIL_LOGO_MAX_HEIGHT / height,
    1,
  );

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function purchaseOrderPdfLinkForNotification(notification: {
  type: string;
  audience: NotificationAudience;
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

  if (
    notification.type === "external_order_created" &&
    notification.audience === "distributor"
  ) {
    return createDistributorOrderReceivedPdfEmailLink({
      purchaseOrderId: notification.entityId,
      storeId: notification.storeId,
    });
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

function normalizedWebsiteUrl(website: string | null) {
  const trimmed = website?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function websiteDisplayLabel(websiteUrl: string) {
  try {
    const url = new URL(websiteUrl);
    const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.hostname.replace(/^www\./i, "")}${pathname}`;
  } catch {
    return websiteUrl;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
