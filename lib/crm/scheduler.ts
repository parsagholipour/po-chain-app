import "server-only";

import schedule from "node-schedule";
import { syncAllEnabledCrmIntegrations } from "@/lib/crm/sync";

const CRM_SYNC_RULE = "0 10 * * * *";
const CRM_SYNC_JOB_NAME = "crm-lead-sync";

const globalForCrmScheduler = globalThis as unknown as {
  crmLeadSyncJob?: schedule.Job;
};

function internalSyncEnabled() {
  return process.env.CRM_INTERNAL_SYNC_ENABLED !== "false";
}

export function startCrmLeadScheduler() {
  if (!internalSyncEnabled()) return;
  if (globalForCrmScheduler.crmLeadSyncJob) return;

  const job = schedule.scheduleJob(CRM_SYNC_JOB_NAME, CRM_SYNC_RULE, async () => {
    try {
      await syncAllEnabledCrmIntegrations();
    } catch (error) {
      console.error("[crm-sync] scheduled run failed", error);
    }
  });

  if (job) {
    globalForCrmScheduler.crmLeadSyncJob = job;
    console.info("[crm-sync] internal hourly scheduler started");
  } else {
    console.error("[crm-sync] could not start internal hourly scheduler");
  }
}
