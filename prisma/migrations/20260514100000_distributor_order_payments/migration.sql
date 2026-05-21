-- CreateEnum
CREATE TYPE "InvoicePurpose" AS ENUM ('manual', 'distributor_order');

-- CreateEnum
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('unpaid', 'pending', 'paid', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "DraftPurchaseOrderStatus" AS ENUM ('pending_payment', 'paid', 'converted', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('created', 'pending', 'paid', 'failed', 'cancelled', 'expired');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "purpose" "InvoicePurpose" NOT NULL DEFAULT 'manual';
ALTER TABLE "Invoice" ADD COLUMN "paymentStatus" "InvoicePaymentStatus" NOT NULL DEFAULT 'unpaid';
ALTER TABLE "Invoice" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'usd';
ALTER TABLE "Invoice" ADD COLUMN "subtotalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "paidAt" TIMESTAMP(3);

-- AlterIndex
DROP INDEX IF EXISTS "PurchaseOrder_invoiceId_key";

-- CreateTable
CREATE TABLE "DraftPurchaseOrder" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DraftPurchaseOrderStatus" NOT NULL DEFAULT 'pending_payment',
    "documentKey" TEXT,
    "invoiceId" UUID NOT NULL,
    "saleChannelId" UUID NOT NULL,
    "saleChannelLocationId" UUID NOT NULL,
    "convertedPurchaseOrderId" UUID,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "DraftPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPurchaseOrderLine" (
    "id" UUID NOT NULL,
    "draftPurchaseOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2),
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "DraftPurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'created',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "providerSessionId" TEXT,
    "providerPaymentIntentId" TEXT,
    "checkoutUrl" TEXT,
    "failureMessage" TEXT,
    "invoiceId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "paymentAttemptId" UUID,
    "invoiceId" UUID,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" UUID,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftPurchaseOrder_convertedPurchaseOrderId_key" ON "DraftPurchaseOrder"("convertedPurchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPurchaseOrder_invoiceId_saleChannelLocationId_key" ON "DraftPurchaseOrder"("invoiceId", "saleChannelLocationId");

-- CreateIndex
CREATE INDEX "DraftPurchaseOrder_storeId_invoiceId_idx" ON "DraftPurchaseOrder"("storeId", "invoiceId");

-- CreateIndex
CREATE INDEX "DraftPurchaseOrder_storeId_saleChannelId_idx" ON "DraftPurchaseOrder"("storeId", "saleChannelId");

-- CreateIndex
CREATE INDEX "DraftPurchaseOrder_storeId_saleChannelLocationId_idx" ON "DraftPurchaseOrder"("storeId", "saleChannelLocationId");

-- CreateIndex
CREATE INDEX "DraftPurchaseOrder_storeId_status_idx" ON "DraftPurchaseOrder"("storeId", "status");

-- CreateIndex
CREATE INDEX "DraftPurchaseOrder_storeId_createdAt_idx" ON "DraftPurchaseOrder"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "DraftPurchaseOrderLine_storeId_draftPurchaseOrderId_idx" ON "DraftPurchaseOrderLine"("storeId", "draftPurchaseOrderId");

-- CreateIndex
CREATE INDEX "DraftPurchaseOrderLine_storeId_productId_idx" ON "DraftPurchaseOrderLine"("storeId", "productId");

-- CreateIndex
CREATE INDEX "DraftPurchaseOrderLine_storeId_createdAt_idx" ON "DraftPurchaseOrderLine"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_providerSessionId_key" ON "PaymentAttempt"("providerSessionId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_storeId_invoiceId_idx" ON "PaymentAttempt"("storeId", "invoiceId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_storeId_provider_status_idx" ON "PaymentAttempt"("storeId", "provider", "status");

-- CreateIndex
CREATE INDEX "PaymentAttempt_storeId_createdAt_idx" ON "PaymentAttempt"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_storeId_processedAt_idx" ON "PaymentWebhookEvent"("storeId", "processedAt");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_invoiceId_idx" ON "PaymentWebhookEvent"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_paymentAttemptId_idx" ON "PaymentWebhookEvent"("paymentAttemptId");

-- CreateIndex
CREATE INDEX "Invoice_storeId_purpose_paymentStatus_idx" ON "Invoice"("storeId", "purpose", "paymentStatus");

-- AddForeignKey
ALTER TABLE "DraftPurchaseOrder" ADD CONSTRAINT "DraftPurchaseOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPurchaseOrder" ADD CONSTRAINT "DraftPurchaseOrder_saleChannelId_fkey" FOREIGN KEY ("saleChannelId") REFERENCES "SaleChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPurchaseOrder" ADD CONSTRAINT "DraftPurchaseOrder_saleChannelLocationId_fkey" FOREIGN KEY ("saleChannelLocationId") REFERENCES "SaleChannelLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPurchaseOrder" ADD CONSTRAINT "DraftPurchaseOrder_convertedPurchaseOrderId_fkey" FOREIGN KEY ("convertedPurchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPurchaseOrder" ADD CONSTRAINT "DraftPurchaseOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPurchaseOrder" ADD CONSTRAINT "DraftPurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPurchaseOrderLine" ADD CONSTRAINT "DraftPurchaseOrderLine_draftPurchaseOrderId_fkey" FOREIGN KEY ("draftPurchaseOrderId") REFERENCES "DraftPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPurchaseOrderLine" ADD CONSTRAINT "DraftPurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPurchaseOrderLine" ADD CONSTRAINT "DraftPurchaseOrderLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPurchaseOrderLine" ADD CONSTRAINT "DraftPurchaseOrderLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
