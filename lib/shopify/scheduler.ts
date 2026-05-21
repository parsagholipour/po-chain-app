import "server-only";

import schedule from "node-schedule";
import { createDailyProductStockSnapshots } from "@/lib/product-stock-snapshot-backups";
import { syncAllEnabledShopifyIntegrations } from "@/lib/shopify/sync";

const SHOPIFY_SYNC_RULE = "0 0 * * * *";
const SHOPIFY_SYNC_JOB_NAME = "shopify-inventory-sync";

const globalForShopifyScheduler = globalThis as unknown as {
  shopifyInventorySyncJob?: schedule.Job;
};

function internalSyncEnabled() {
  return process.env.SHOPIFY_INTERNAL_SYNC_ENABLED !== "false";
}

export function startShopifyInventoryScheduler() {
  if (!internalSyncEnabled()) return;
  if (globalForShopifyScheduler.shopifyInventorySyncJob) return;

  const job = schedule.scheduleJob(
    SHOPIFY_SYNC_JOB_NAME,
    SHOPIFY_SYNC_RULE,
    async () => {
      try {
        await syncAllEnabledShopifyIntegrations();
        const snapshotResults = await createDailyProductStockSnapshots();
        const createdCount = snapshotResults.filter((result) => !result.skipped)
          .length;
        if (createdCount > 0) {
          console.info(
            `[product-stock-backup] created ${createdCount} daily stock snapshot(s)`,
          );
        }
      } catch (error) {
        console.error("[shopify-sync] scheduled run failed", error);
      }
    },
  );

  if (job) {
    globalForShopifyScheduler.shopifyInventorySyncJob = job;
    console.info("[shopify-sync] internal hourly scheduler started");
  } else {
    console.error("[shopify-sync] could not start internal hourly scheduler");
  }
}
