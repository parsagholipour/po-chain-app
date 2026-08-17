import "server-only";

import { parseCrmWebhookEnvelope } from "@/lib/crm/lead";
import {
  findCrmWebhookDelivery,
  recordCrmWebhookDelivery,
  softDeleteCrmLead,
  upsertCrmLead,
} from "@/lib/crm/upsert";

const UPSERT_EVENTS = new Set(["lead.created", "lead.updated", "lead.converted"]);

export async function handleCrmLeadWebhookEvent(input: {
  storeId: string;
  integrationId: string;
  organizationId: string | null;
  payload: unknown;
  deliveryId: string | null;
}) {
  const envelope = parseCrmWebhookEnvelope(input.payload);
  const deliveryId = input.deliveryId || envelope.id;

  const existing = await findCrmWebhookDelivery({
    integrationId: input.integrationId,
    deliveryId,
  });
  if (existing) return { skipped: true as const, reason: "duplicate" as const };

  let result: { skipped: true; reason: "organization_mismatch" | "test" | "unknown_event" } | {
    skipped: false;
    reason: null;
  };

  if (input.organizationId && envelope.organizationId !== input.organizationId) {
    console.warn("[crm-webhook] organization mismatch", {
      integrationId: input.integrationId,
      expected: input.organizationId,
      received: envelope.organizationId,
      event: envelope.event,
    });
    result = { skipped: true, reason: "organization_mismatch" };
  } else if (envelope.event === "webhook.test") {
    result = { skipped: true, reason: "test" };
  } else if (UPSERT_EVENTS.has(envelope.event)) {
    await upsertCrmLead({
      storeId: input.storeId,
      integrationId: input.integrationId,
      lead: envelope.data,
      trigger: "webhook",
    });
    result = { skipped: false, reason: null };
  } else if (envelope.event === "lead.deleted") {
    await softDeleteCrmLead({
      storeId: input.storeId,
      data: envelope.data,
      trigger: "webhook",
    });
    result = { skipped: false, reason: null };
  } else {
    console.warn("[crm-webhook] unknown event", envelope.event);
    result = { skipped: true, reason: "unknown_event" };
  }

  await recordCrmWebhookDelivery({
    storeId: input.storeId,
    integrationId: input.integrationId,
    deliveryId,
    event: envelope.event,
  });
  return result;
}
