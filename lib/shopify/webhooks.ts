import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const INVENTORY_LEVELS_TOPIC_HEADER = "inventory_levels/update";

export function verifyShopifyWebhookHmac({
  rawBody,
  hmacHeader,
  secret,
}: {
  rawBody: Buffer;
  hmacHeader: string | null;
  secret: string;
}) {
  if (!hmacHeader) return false;

  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  const expected = Buffer.from(digest, "utf8");
  const actual = Buffer.from(hmacHeader, "utf8");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isInventoryLevelsUpdateTopic(topic: string | null) {
  if (!topic) return false;
  const normalized = topic.trim().toLowerCase();
  return (
    normalized === INVENTORY_LEVELS_TOPIC_HEADER ||
    normalized === "inventory_levels_update"
  );
}
