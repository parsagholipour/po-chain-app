import assert from "node:assert/strict";
import test from "node:test";
import {
  isStaleLeadDelete,
  isStaleLeadUpdate,
  mapCrmLead,
  mapDeletedLead,
  noneToNull,
  parseCrmWebhookEnvelope,
  sampleProductLineIds,
} from "./lead.ts";

const leadFixture = {
  id: "clyk2leadexample00000000001",
  organizationId: "clyk2orgexample00000000001",
  status: "Sample requested",
  salutation: "Ms.",
  firstName: "Ada",
  lastName: "Lovelace",
  company: "Analytical Engines",
  title: "Mathematician",
  website: "https://analytical.example",
  description: "Requested a sample dice set for evaluation.",
  ownerId: "clyk2userexample00000000001",
  owner: {
    id: "clyk2userexample00000000001",
    name: "Casey Rivera",
    alias: "casey",
    email: "casey@example.com",
  },
  rating: "Hot",
  phone: "+1 555 0100",
  email: "ada@example.com",
  country: "United States",
  street: "12 Engine Yard",
  postalCode: "02139",
  city: "Cambridge",
  state: "Massachusetts",
  numberOfEmployees: 12,
  annualRevenue: "120000",
  leadSource: "Web",
  industry: "Technology",
  sampleRequestedDate: "2026-08-01T00:00:00.000Z",
  sampleStatus: "Shipped",
  courier: "USPS",
  trackingNumber: "9400111899223197428490",
  deliveryDate: null,
  convertedAt: null,
  convertedAccountId: null,
  convertedContactId: null,
  convertedOpportunityId: null,
  createdById: "clyk2userexample00000000001",
  updatedById: "clyk2userexample00000000001",
  createdAt: "2026-08-01T10:11:12.000Z",
  updatedAt: "2026-08-17T08:09:10.000Z",
  extraFutureField: "keep-me",
  sampleProducts: [
    {
      id: "clyk2lineexample00000000001",
      productId: "clyk2prodexample00000000001",
      quantity: "2.0000",
      unitPrice: "10.00",
      totalPrice: "20.00",
      description: null,
      displayOrder: 0,
      product: {
        id: "clyk2prodexample00000000001",
        name: "Obsidian Dice Set",
        sku: "AF-DICE-001",
      },
    },
    {
      id: "clyk2lineexample00000000002",
      productId: "clyk2prodexample00000000002",
      quantity: "1",
      unitPrice: "5.00",
      totalPrice: "5.00",
      description: "Note",
      displayOrder: 1,
      product: null,
    },
  ],
  shipment: {
    id: "clyk2shipexample00000000001",
    carrier: "USPS",
    status: "InTransit",
  },
};

test("noneToNull treats UI sentinels as unset", () => {
  assert.equal(noneToNull(null), null);
  assert.equal(noneToNull(""), null);
  assert.equal(noneToNull("--None--"), null);
  assert.equal(noneToNull(" Hot "), "Hot");
});

test("maps a CRM lead including sample lines and unknown fields", () => {
  const mapped = mapCrmLead(leadFixture);
  assert.equal(mapped.crmLeadId, leadFixture.id);
  assert.equal(mapped.status, "Sample requested");
  assert.equal(mapped.annualRevenue, "120000");
  assert.equal(mapped.owner.email, "casey@example.com");
  assert.equal(mapped.shipment?.carrier, "USPS");
  assert.equal(mapped.payload.extraFutureField, "keep-me");
  assert.deepEqual(sampleProductLineIds(mapped.sampleProducts), [
    "clyk2lineexample00000000001",
    "clyk2lineexample00000000002",
  ]);
  assert.equal(mapped.sampleProducts[0]?.product?.sku, "AF-DICE-001");
  assert.equal(mapped.sampleProducts[1]?.description, "Note");
});

test("drops malformed sample lines instead of failing the lead", () => {
  const mapped = mapCrmLead({
    ...leadFixture,
    sampleProducts: [
      leadFixture.sampleProducts[0],
      { quantity: "1" },
    ],
  });
  assert.equal(mapped.sampleProducts.length, 1);
  assert.equal(mapped.sampleProducts[0]?.crmLineId, "clyk2lineexample00000000001");
});

test("treats --None-- picklist values as null", () => {
  const mapped = mapCrmLead({
    ...leadFixture,
    rating: "--None--",
    salutation: "--None--",
  });
  assert.equal(mapped.rating, null);
  assert.equal(mapped.salutation, null);
});

test("defaults missing status to New", () => {
  const mapped = mapCrmLead({ ...leadFixture, status: null });
  assert.equal(mapped.status, "New");
});

test("skips stale updates and accepts equal or newer timestamps", () => {
  const stored = new Date("2026-08-17T08:09:10.000Z");
  assert.equal(isStaleLeadUpdate(stored, new Date("2026-08-17T08:09:09.000Z")), true);
  assert.equal(isStaleLeadUpdate(stored, new Date("2026-08-17T08:09:10.000Z")), false);
  assert.equal(isStaleLeadUpdate(stored, new Date("2026-08-17T08:09:11.000Z")), false);
});

test("skips deletes that are older than the stored lead", () => {
  const stored = new Date("2026-08-17T12:00:00.000Z");
  assert.equal(isStaleLeadDelete(stored, new Date("2026-08-17T11:59:59.000Z")), true);
  assert.equal(isStaleLeadDelete(stored, new Date("2026-08-17T12:00:01.000Z")), false);
});

test("maps a deleted-lead webhook body", () => {
  const mapped = mapDeletedLead({
    id: "clyk2leadexample00000000001",
    firstName: "Ada",
    lastName: "Lovelace",
    company: "Analytical Engines",
    email: "ada@example.com",
    deletedAt: "2026-08-17T12:05:00.000Z",
  });
  assert.equal(mapped.crmLeadId, "clyk2leadexample00000000001");
  assert.equal(mapped.deletedAt.toISOString(), "2026-08-17T12:05:00.000Z");
});

test("parses the CRM webhook envelope", () => {
  const envelope = parseCrmWebhookEnvelope({
    id: "clyk2delexample00000000001",
    event: "lead.updated",
    createdAt: "2026-08-17T12:00:00.000Z",
    organizationId: "clyk2orgexample00000000001",
    data: leadFixture,
  });
  assert.equal(envelope.event, "lead.updated");
  assert.equal(envelope.id, "clyk2delexample00000000001");
  assert.equal(envelope.data, leadFixture);
});
