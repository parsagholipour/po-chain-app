-- CreateTable
CREATE TABLE "CrmIntegration" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiTokenEncrypted" TEXT,
    "webhookSecretEncrypted" TEXT,
    "organizationId" TEXT,
    "organizationName" TEXT,
    "organizationSlug" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "lastSyncedLeadCount" INTEGER NOT NULL DEFAULT 0,
    "lastIncrementalAt" TIMESTAMP(3),
    "syncLockUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLead" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "crmLeadId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "salutation" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "title" TEXT,
    "website" TEXT,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "owner" JSONB NOT NULL,
    "rating" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "country" TEXT,
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "state" TEXT,
    "numberOfEmployees" INTEGER,
    "annualRevenue" DECIMAL(18,2),
    "leadSource" TEXT,
    "industry" TEXT,
    "sampleRequestedDate" TIMESTAMP(3),
    "sampleStatus" TEXT,
    "courier" TEXT,
    "trackingNumber" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "convertedAccountId" TEXT,
    "convertedContactId" TEXT,
    "convertedOpportunityId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "crmCreatedAt" TIMESTAMP(3) NOT NULL,
    "crmUpdatedAt" TIMESTAMP(3) NOT NULL,
    "shipment" JSONB,
    "payload" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncTrigger" TEXT NOT NULL,
    "lastSeenInRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLeadSampleProduct" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "crmLineId" TEXT NOT NULL,
    "crmProductId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "totalPrice" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "product" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLeadSampleProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmWebhookDelivery" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmIntegration_storeId_key" ON "CrmIntegration"("storeId");

-- CreateIndex
CREATE INDEX "CrmIntegration_enabled_idx" ON "CrmIntegration"("enabled");

-- CreateIndex
CREATE INDEX "CrmIntegration_syncLockUntil_idx" ON "CrmIntegration"("syncLockUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLead_storeId_crmLeadId_key" ON "CrmLead"("storeId", "crmLeadId");

-- CreateIndex
CREATE INDEX "CrmLead_storeId_status_idx" ON "CrmLead"("storeId", "status");

-- CreateIndex
CREATE INDEX "CrmLead_storeId_email_idx" ON "CrmLead"("storeId", "email");

-- CreateIndex
CREATE INDEX "CrmLead_storeId_crmUpdatedAt_idx" ON "CrmLead"("storeId", "crmUpdatedAt");

-- CreateIndex
CREATE INDEX "CrmLead_storeId_deletedAt_idx" ON "CrmLead"("storeId", "deletedAt");

-- CreateIndex
CREATE INDEX "CrmLead_storeId_lastSeenInRunId_idx" ON "CrmLead"("storeId", "lastSeenInRunId");

-- CreateIndex
CREATE INDEX "CrmLead_integrationId_idx" ON "CrmLead"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLeadSampleProduct_leadId_crmLineId_key" ON "CrmLeadSampleProduct"("leadId", "crmLineId");

-- CreateIndex
CREATE INDEX "CrmLeadSampleProduct_storeId_leadId_idx" ON "CrmLeadSampleProduct"("storeId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmWebhookDelivery_integrationId_deliveryId_key" ON "CrmWebhookDelivery"("integrationId", "deliveryId");

-- CreateIndex
CREATE INDEX "CrmWebhookDelivery_storeId_processedAt_idx" ON "CrmWebhookDelivery"("storeId", "processedAt");

-- AddForeignKey
ALTER TABLE "CrmIntegration" ADD CONSTRAINT "CrmIntegration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "CrmIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadSampleProduct" ADD CONSTRAINT "CrmLeadSampleProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadSampleProduct" ADD CONSTRAINT "CrmLeadSampleProduct_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWebhookDelivery" ADD CONSTRAINT "CrmWebhookDelivery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmWebhookDelivery" ADD CONSTRAINT "CrmWebhookDelivery_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "CrmIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
