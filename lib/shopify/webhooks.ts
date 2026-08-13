import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const INVENTORY_LEVELS_TOPIC_HEADER = "inventory_levels/update";
const ORDERS_PAID_TOPIC_HEADER = "orders/paid";
const PRODUCTS_CREATE_TOPIC_HEADER = "products/create";
const PRODUCTS_UPDATE_TOPIC_HEADER = "products/update";
const PRODUCTS_DELETE_TOPIC_HEADER = "products/delete";

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

export function isOrdersPaidTopic(topic: string | null) {
  if (!topic) return false;
  const normalized = topic.trim().toLowerCase();
  return normalized === ORDERS_PAID_TOPIC_HEADER || normalized === "orders_paid";
}

export function isProductsCreateTopic(topic: string | null) {
  if (!topic) return false;
  const normalized = topic.trim().toLowerCase();
  return normalized === PRODUCTS_CREATE_TOPIC_HEADER || normalized === "products_create";
}

export function isProductsUpdateTopic(topic: string | null) {
  if (!topic) return false;
  const normalized = topic.trim().toLowerCase();
  return normalized === PRODUCTS_UPDATE_TOPIC_HEADER || normalized === "products_update";
}

export function isProductsDeleteTopic(topic: string | null) {
  if (!topic) return false;
  const normalized = topic.trim().toLowerCase();
  return normalized === PRODUCTS_DELETE_TOPIC_HEADER || normalized === "products_delete";
}

export function isProductCatalogTopic(topic: string | null) {
  return isProductsCreateTopic(topic) || isProductsUpdateTopic(topic) || isProductsDeleteTopic(topic);
}
