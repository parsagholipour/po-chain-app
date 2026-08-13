import "server-only";

import schedule from "node-schedule";
import { scanAllStores } from "@/lib/operator-warnings/scan";

const OPERATOR_WARNING_SCAN_RULE = "0 0 * * * *";
const OPERATOR_WARNING_SCAN_JOB_NAME = "operator-warning-scan";

const globalForOperatorWarningScheduler = globalThis as unknown as {
  operatorWarningScanJob?: schedule.Job;
};

function internalScanEnabled() {
  return process.env.OPERATOR_WARNING_SCAN_ENABLED !== "false";
}

export function startOperatorWarningScheduler() {
  if (!internalScanEnabled()) return;
  if (globalForOperatorWarningScheduler.operatorWarningScanJob) return;

  const job = schedule.scheduleJob(
    OPERATOR_WARNING_SCAN_JOB_NAME,
    OPERATOR_WARNING_SCAN_RULE,
    async () => {
      try {
        await scanAllStores();
      } catch (error) {
        console.error("[operator-warnings] scheduled scan failed", error);
      }
    },
  );

  if (job) {
    globalForOperatorWarningScheduler.operatorWarningScanJob = job;
    console.info("[operator-warnings] internal hourly scheduler started");
  } else {
    console.error("[operator-warnings] could not start internal hourly scheduler");
  }
}
