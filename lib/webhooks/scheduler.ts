import "server-only";

import schedule from "node-schedule";
import { runWebhookDispatchSweep } from "@/lib/webhooks/delivery";

/** Every minute: the shortest retry backoff is one minute. */
const WEBHOOK_RETRY_RULE = "0 * * * * *";
const WEBHOOK_RETRY_JOB_NAME = "webhook-delivery-retry";

const globalForWebhookScheduler = globalThis as unknown as {
  webhookDeliveryRetryJob?: schedule.Job;
};

function internalDispatchEnabled() {
  return process.env.WEBHOOK_INTERNAL_DISPATCH_ENABLED !== "false";
}

export function startWebhookDeliveryScheduler() {
  if (!internalDispatchEnabled()) return;
  if (globalForWebhookScheduler.webhookDeliveryRetryJob) return;

  const job = schedule.scheduleJob(WEBHOOK_RETRY_JOB_NAME, WEBHOOK_RETRY_RULE, async () => {
    try {
      await runWebhookDispatchSweep();
    } catch (error) {
      console.error("[webhooks] scheduled dispatch failed", error);
    }
  });

  if (job) {
    globalForWebhookScheduler.webhookDeliveryRetryJob = job;
    console.info("[webhooks] internal delivery retry scheduler started");
  } else {
    console.error("[webhooks] could not start internal delivery retry scheduler");
  }
}
