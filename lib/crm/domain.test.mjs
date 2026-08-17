import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCrmApiToken,
  assertCrmWebhookSecret,
  buildLeadsQuery,
  crmApiBaseUrl,
  crmLeadsWebhookPath,
  isInternalHostname,
  normalizeCrmBaseUrl,
} from "./domain.ts";

test("normalizes a host without a scheme", () => {
  assert.equal(normalizeCrmBaseUrl("crm.example.com"), "https://crm.example.com");
});

test("strips a trailing /api/v1 path", () => {
  assert.equal(
    normalizeCrmBaseUrl("https://crm.example.com/api/v1/"),
    "https://crm.example.com",
  );
});

test("keeps a non-root path that is not /api/v1", () => {
  assert.equal(
    normalizeCrmBaseUrl("https://crm.example.com/tenant"),
    "https://crm.example.com/tenant",
  );
});

test("builds the v1 API base from the origin", () => {
  assert.equal(crmApiBaseUrl("https://crm.example.com/api/v1"), "https://crm.example.com/api/v1");
});

test("rejects a blank host", () => {
  assert.throws(() => normalizeCrmBaseUrl("  "), /CRM host URL is required/);
});

test("asserts crm_ token prefix", () => {
  assert.doesNotThrow(() => assertCrmApiToken("crm_abc"));
  assert.throws(() => assertCrmApiToken("sk_abc"), /must start with crm_/);
});

test("asserts whsec_ webhook secret prefix", () => {
  assert.doesNotThrow(() => assertCrmWebhookSecret("whsec_abc"));
  assert.throws(() => assertCrmWebhookSecret("crm_abc"), /must start with whsec_/);
});

test("builds cursor pagination query params", () => {
  const qs = buildLeadsQuery({
    cursor: "lead_50",
    limit: 100,
    updatedSince: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(qs.get("limit"), "100");
  assert.equal(qs.get("cursor"), "lead_50");
  assert.equal(qs.get("updatedSince"), "2026-08-01T00:00:00.000Z");
});

test("omits empty list filters", () => {
  const qs = buildLeadsQuery();
  assert.equal(qs.get("limit"), "100");
  assert.equal(qs.has("cursor"), false);
  assert.equal(qs.has("updatedSince"), false);
});

test("treats localhost and RFC1918 hosts as internal", () => {
  assert.equal(isInternalHostname("localhost"), true);
  assert.equal(isInternalHostname("127.0.0.1"), true);
  assert.equal(isInternalHostname("10.0.0.4"), true);
  assert.equal(isInternalHostname("192.168.1.9"), true);
  assert.equal(isInternalHostname("crm.example.com"), false);
});

test("builds the relative webhook path", () => {
  assert.equal(
    crmLeadsWebhookPath("11111111-1111-1111-1111-111111111111"),
    "/api/webhooks/crm/11111111-1111-1111-1111-111111111111/leads",
  );
});
