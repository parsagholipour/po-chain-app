import "server-only";

import schedule from "node-schedule";
import { syncAllEnabledCjDropshippingIntegrations } from "@/lib/cjdropshipping/sync";

const CJ_SYNC_RULE = "0 5 * * * *";
const CJ_SYNC_JOB_NAME = "cjdropshipping-inventory-sync";

const globalForCjScheduler = globalThis as unknown as {
  cjDropshippingInventorySyncJob?: schedule.Job;
};

function internalSyncEnabled() {
  return process.env.CJDROPSHIPPING_INTERNAL_SYNC_ENABLED !== "false";
}

export function startCjDropshippingInventoryScheduler() {
  if (!internalSyncEnabled()) return;
  if (globalForCjScheduler.cjDropshippingInventorySyncJob) return;

  const job = schedule.scheduleJob(CJ_SYNC_JOB_NAME, CJ_SYNC_RULE, async () => {
    try {
      await syncAllEnabledCjDropshippingIntegrations();
    } catch (error) {
      console.error("[cjdropshipping-sync] scheduled run failed", error);
    }
  });

  if (job) {
    globalForCjScheduler.cjDropshippingInventorySyncJob = job;
    console.info("[cjdropshipping-sync] internal hourly scheduler started");
  } else {
    console.error("[cjdropshipping-sync] could not start internal hourly scheduler");
  }
}
