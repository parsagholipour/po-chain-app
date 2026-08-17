import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseCrmWebhookEnvelope } from "./lead.ts";

function sign(rawBody, secret, timestampSeconds) {
  const hex = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`, "utf8")
    .digest("hex");
  return `t=${timestampSeconds},v1=${hex}`;
}

/** Same algorithm as lib/webhooks/signature.ts and CRM X-CRM-Signature. */
function verifyCrmSignature(rawBody, header, secret, timestampSeconds) {
  if (!header) return false;
  const parts = new Map(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const signedAt = Number.parseInt(parts.get("t") ?? "", 10);
  const provided = parts.get("v1");
  if (!Number.isFinite(signedAt) || !provided) return false;
  if (Math.abs(timestampSeconds - signedAt) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${signedAt}.${rawBody}`, "utf8")
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

test("verifies an X-CRM-Signature header with the PO HMAC scheme", () => {
  const secret = "whsec_testsecret";
  const rawBody = JSON.stringify({
    id: "clyk2delexample00000000001",
    event: "webhook.test",
    createdAt: "2026-08-17T12:06:00.000Z",
    organizationId: "clyk2orgexample00000000001",
    data: { message: "Webhook test from CRM", sentAt: "2026-08-17T12:06:00.000Z" },
  });
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const header = sign(rawBody, secret, timestampSeconds);

  assert.equal(verifyCrmSignature(rawBody, header, secret, timestampSeconds), true);
  assert.equal(verifyCrmSignature(rawBody, header, "whsec_other", timestampSeconds), false);
});

test("rejects a re-serialized body", () => {
  const secret = "whsec_testsecret";
  const rawBody = '{"event":"lead.updated","id":"1","createdAt":"t","organizationId":"o","data":{}}';
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const header = sign(rawBody, secret, timestampSeconds);
  const resent = '{"data":{},"event":"lead.updated","id":"1","createdAt":"t","organizationId":"o"}';

  assert.equal(verifyCrmSignature(resent, header, secret, timestampSeconds), false);
});

test("rejects signatures outside the 300s replay window", () => {
  const secret = "whsec_testsecret";
  const rawBody = "{}";
  const signedAt = Math.floor(Date.now() / 1000) - 400;
  const header = sign(rawBody, secret, signedAt);
  assert.equal(verifyCrmSignature(rawBody, header, secret, Math.floor(Date.now() / 1000)), false);
});

test("parses a webhook.test envelope", () => {
  const envelope = parseCrmWebhookEnvelope({
    id: "clyk2delexample00000000003",
    event: "webhook.test",
    createdAt: "2026-08-17T12:06:00.000Z",
    organizationId: "clyk2orgexample00000000001",
    data: { message: "Webhook test from CRM", sentAt: "2026-08-17T12:06:00.000Z" },
  });
  assert.equal(envelope.event, "webhook.test");
});
