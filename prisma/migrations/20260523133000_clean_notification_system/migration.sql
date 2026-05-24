-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'purchase_order_created',
  'external_order_created',
  'payment_failed',
  'payment_cancelled',
  'po_status_changed',
  'shipment_status_changed',
  'backorder_actualized',
  'po_osd_created'
);

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('info', 'important', 'urgent');

-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('store_owner', 'distributor');

-- CreateEnum
CREATE TYPE "NotificationEmailDeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "Notification" (
  "id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "priority" "NotificationPriority" NOT NULL DEFAULT 'info',
  "audience" "NotificationAudience" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "href" TEXT,
  "entityType" TEXT,
  "entityId" UUID,
  "dedupeKey" TEXT NOT NULL,
  "data" JSONB,
  "saleChannelId" UUID,
  "storeId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" UUID,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRead" (
  "notificationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("notificationId","userId")
);

-- CreateTable
CREATE TABLE "NotificationEmailDelivery" (
  "id" UUID NOT NULL,
  "notificationId" UUID NOT NULL,
  "recipientEmail" TEXT,
  "recipientName" TEXT,
  "status" "NotificationEmailDeliveryStatus" NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "messageId" TEXT,
  "lastError" TEXT,
  "storeId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationEmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_storeId_dedupeKey_key" ON "Notification"("storeId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_storeId_audience_createdAt_idx" ON "Notification"("storeId", "audience", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_storeId_saleChannelId_audience_createdAt_idx" ON "Notification"("storeId", "saleChannelId", "audience", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_storeId_type_createdAt_idx" ON "Notification"("storeId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_storeId_entityType_entityId_idx" ON "Notification"("storeId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "NotificationRead_userId_readAt_idx" ON "NotificationRead"("userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationEmailDelivery_status_nextAttemptAt_createdAt_idx" ON "NotificationEmailDelivery"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEmailDelivery_storeId_status_createdAt_idx" ON "NotificationEmailDelivery"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEmailDelivery_notificationId_idx" ON "NotificationEmailDelivery"("notificationId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_saleChannelId_fkey" FOREIGN KEY ("saleChannelId") REFERENCES "SaleChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEmailDelivery" ADD CONSTRAINT "NotificationEmailDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEmailDelivery" ADD CONSTRAINT "NotificationEmailDelivery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
