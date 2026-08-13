-- CreateEnum
CREATE TYPE "OperatorWarningTier" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "OperatorWarningStatus" AS ENUM ('open', 'disregarded');

-- CreateEnum
CREATE TYPE "OperatorWarningType" AS ENUM ('product_missing_sku', 'product_missing_wholesale', 'product_missing_cost', 'product_unverified', 'po_line_missing_cost', 'po_line_missing_price', 'mo_line_missing_cost', 'mo_allocation_unverified', 'mo_missing_eta', 'po_stale_in_transit');

-- AlterTable
ALTER TABLE "ApiToken" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "scopes" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WebhookDelivery" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WebhookEndpoint" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "events" DROP DEFAULT;

-- CreateTable
CREATE TABLE "OperatorWarning" (
    "id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "type" "OperatorWarningType" NOT NULL,
    "tier" "OperatorWarningTier" NOT NULL,
    "status" "OperatorWarningStatus" NOT NULL DEFAULT 'open',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT,
    "issuePresent" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "disregardedAt" TIMESTAMP(3),
    "disregardReason" TEXT,
    "disregardedById" UUID,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorWarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorWarningScanState" (
    "storeId" UUID NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "lastOpenCount" INTEGER NOT NULL DEFAULT 0,
    "lockUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorWarningScanState_pkey" PRIMARY KEY ("storeId")
);

-- CreateIndex
CREATE INDEX "OperatorWarning_storeId_status_lastSeenAt_idx" ON "OperatorWarning"("storeId", "status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "OperatorWarning_storeId_status_tier_idx" ON "OperatorWarning"("storeId", "status", "tier");

-- CreateIndex
CREATE INDEX "OperatorWarning_storeId_type_idx" ON "OperatorWarning"("storeId", "type");

-- CreateIndex
CREATE INDEX "OperatorWarning_storeId_lastSeenAt_idx" ON "OperatorWarning"("storeId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "OperatorWarning_disregardedById_idx" ON "OperatorWarning"("disregardedById");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorWarning_storeId_fingerprint_key" ON "OperatorWarning"("storeId", "fingerprint");

-- CreateIndex
CREATE INDEX "OperatorWarningScanState_lockUntil_idx" ON "OperatorWarningScanState"("lockUntil");

-- AddForeignKey
ALTER TABLE "OperatorWarning" ADD CONSTRAINT "OperatorWarning_disregardedById_fkey" FOREIGN KEY ("disregardedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorWarning" ADD CONSTRAINT "OperatorWarning_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorWarningScanState" ADD CONSTRAINT "OperatorWarningScanState_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
