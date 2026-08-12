import assert from "node:assert/strict";
import test from "node:test";
import { planShopifyDraftOrderLines } from "./checkout-line-plan.ts";

function variant(overrides = {}) {
  return {
    id: "gid://shopify/ProductVariant/1",
    sku: "SKU-1",
    inventoryQuantity: 100,
    inventoryPolicy: "CONTINUE",
    tracked: false,
    productStatus: "ACTIVE",
    ...overrides,
  };
}

function lineItem(overrides = {}) {
  return {
    name: "Radiant 100+ Deck Vault",
    sku: "SKU-1",
    quantity: 1,
    unitAmountCents: 1000,
    ...overrides,
  };
}

function planOne(item, variants = []) {
  const sku = item.sku?.trim();
  const variantsBySku = new Map();
  if (sku && variants.length > 0) variantsBySku.set(sku, variants);
  const plan = planShopifyDraftOrderLines({ lineItems: [item], variantsBySku });
  assert.equal(plan.lines.length, 1);
  return plan;
}

test("a single exact SKU match becomes a variant line with no warning", () => {
  const plan = planOne(lineItem({ sku: "SKU-1", quantity: 3, unitAmountCents: 1250 }), [
    variant({ id: "gid://shopify/ProductVariant/77" }),
  ]);

  assert.deepEqual(plan.lines[0], {
    mode: "variant",
    reason: "matched",
    name: "Radiant 100+ Deck Vault",
    sku: "SKU-1",
    quantity: 3,
    unitAmountCents: 1250,
    variantId: "gid://shopify/ProductVariant/77",
  });
  assert.deepEqual(plan.warnings, []);
  assert.equal(plan.totalCents, 3750);
});

test("a missing or blank SKU becomes a custom line with reason no_sku", () => {
  for (const sku of [null, undefined, "", "   ", "\t\n "]) {
    const plan = planOne(lineItem({ sku, unitAmountCents: 499 }));
    assert.equal(plan.lines[0].mode, "custom", String(sku));
    assert.equal(plan.lines[0].reason, "no_sku", String(sku));
    assert.equal(plan.lines[0].sku, null, String(sku));
    assert.equal(plan.lines[0].variantId, null, String(sku));
    assert.equal(plan.lines[0].unitAmountCents, 499, String(sku));
    assert.deepEqual(plan.warnings, [
      { sku: null, name: "Radiant 100+ Deck Vault", reason: "no_sku" },
    ]);
  }
});

test("an unknown SKU becomes a custom line with reason sku_not_found", () => {
  const plan = planShopifyDraftOrderLines({
    lineItems: [lineItem({ sku: "MISSING-1", quantity: 2, unitAmountCents: 745 })],
    variantsBySku: new Map([["SKU-1", [variant()]]]),
  });

  assert.equal(plan.lines[0].mode, "custom");
  assert.equal(plan.lines[0].reason, "sku_not_found");
  assert.equal(plan.lines[0].sku, "MISSING-1");
  assert.equal(plan.lines[0].variantId, null);
  assert.equal(plan.totalCents, 1490);
});

test("an empty match list for a known key still becomes sku_not_found", () => {
  const plan = planShopifyDraftOrderLines({
    lineItems: [lineItem({ sku: "SKU-1" })],
    variantsBySku: new Map([["SKU-1", []]]),
  });

  assert.equal(plan.lines[0].reason, "sku_not_found");
  assert.equal(plan.lines[0].mode, "custom");
});

test("two or more exact matches become a custom line with reason ambiguous_sku", () => {
  const plan = planOne(lineItem({ sku: "SKU-1", quantity: 2, unitAmountCents: 1000 }), [
    variant({ id: "gid://shopify/ProductVariant/1" }),
    variant({ id: "gid://shopify/ProductVariant/2" }),
  ]);

  assert.equal(plan.lines[0].mode, "custom");
  assert.equal(plan.lines[0].reason, "ambiguous_sku");
  assert.equal(plan.lines[0].variantId, null);
  assert.deepEqual(plan.warnings, [
    { sku: "SKU-1", name: "Radiant 100+ Deck Vault", reason: "ambiguous_sku" },
  ]);

  const threeMatches = planOne(lineItem(), [variant(), variant(), variant()]);
  assert.equal(threeMatches.lines[0].reason, "ambiguous_sku");
});

test("an archived product becomes a custom line with reason product_archived", () => {
  for (const productStatus of ["ARCHIVED", "archived"]) {
    const plan = planOne(lineItem(), [variant({ productStatus })]);
    assert.equal(plan.lines[0].mode, "custom", productStatus);
    assert.equal(plan.lines[0].reason, "product_archived", productStatus);
    assert.equal(plan.lines[0].variantId, null, productStatus);
  }

  for (const productStatus of ["ACTIVE", "DRAFT", null]) {
    const plan = planOne(lineItem(), [variant({ productStatus })]);
    assert.equal(plan.lines[0].reason, "matched", String(productStatus));
  }
});

test("a tracked DENY variant with short stock becomes a custom line with reason inventory_deny", () => {
  const plan = planOne(lineItem({ quantity: 5, unitAmountCents: 700 }), [
    variant({ tracked: true, inventoryPolicy: "DENY", inventoryQuantity: 4 }),
  ]);

  assert.equal(plan.lines[0].mode, "custom");
  assert.equal(plan.lines[0].reason, "inventory_deny");
  assert.equal(plan.lines[0].variantId, null);
  assert.equal(plan.lines[0].unitAmountCents, 700);
  assert.equal(plan.totalCents, 3500);

  const unknownQuantity = planOne(lineItem({ quantity: 1 }), [
    variant({ tracked: true, inventoryPolicy: "DENY", inventoryQuantity: null }),
  ]);
  assert.equal(unknownQuantity.lines[0].reason, "inventory_deny");
});

test("back-orders still match a variant unless every deny condition holds", () => {
  const backOrderCases = [
    [
      "untracked variant with no stock",
      variant({ tracked: false, inventoryPolicy: "DENY", inventoryQuantity: 0 }),
    ],
    [
      "unknown tracking with no stock",
      variant({ tracked: null, inventoryPolicy: "DENY", inventoryQuantity: 0 }),
    ],
    [
      "tracked CONTINUE variant with no stock",
      variant({ tracked: true, inventoryPolicy: "CONTINUE", inventoryQuantity: 0 }),
    ],
    [
      "tracked variant with no inventory policy",
      variant({ tracked: true, inventoryPolicy: null, inventoryQuantity: 0 }),
    ],
    [
      "tracked DENY variant with exactly enough stock",
      variant({ tracked: true, inventoryPolicy: "DENY", inventoryQuantity: 5 }),
    ],
    [
      "tracked DENY variant with surplus stock",
      variant({ tracked: true, inventoryPolicy: "DENY", inventoryQuantity: 6 }),
    ],
  ];

  for (const [label, planVariant] of backOrderCases) {
    const plan = planOne(lineItem({ quantity: 5 }), [planVariant]);
    assert.equal(plan.lines[0].mode, "variant", label);
    assert.equal(plan.lines[0].reason, "matched", label);
    assert.equal(plan.lines[0].variantId, planVariant.id, label);
    assert.deepEqual(plan.warnings, [], label);
  }
});

test("whitespace-padded SKUs resolve against the trimmed key", () => {
  const plan = planShopifyDraftOrderLines({
    lineItems: [lineItem({ sku: "  SKU-1\n", quantity: 2, unitAmountCents: 300 })],
    variantsBySku: new Map([["SKU-1", [variant({ id: "gid://shopify/ProductVariant/9" })]]]),
  });

  assert.equal(plan.lines[0].mode, "variant");
  assert.equal(plan.lines[0].reason, "matched");
  assert.equal(plan.lines[0].sku, "SKU-1");
  assert.equal(plan.lines[0].variantId, "gid://shopify/ProductVariant/9");
  assert.equal(plan.totalCents, 600);
});

test("SKU matching is case sensitive", () => {
  const variantsBySku = new Map([["ABC-1", [variant({ sku: "ABC-1" })]]]);

  const lowerCase = planShopifyDraftOrderLines({
    lineItems: [lineItem({ sku: "abc-1" })],
    variantsBySku,
  });
  assert.equal(lowerCase.lines[0].mode, "custom");
  assert.equal(lowerCase.lines[0].reason, "sku_not_found");
  assert.equal(lowerCase.lines[0].sku, "abc-1");

  const exact = planShopifyDraftOrderLines({
    lineItems: [lineItem({ sku: "ABC-1" })],
    variantsBySku,
  });
  assert.equal(exact.lines[0].mode, "variant");
  assert.equal(exact.lines[0].reason, "matched");
});

test("totalCents is the sum of unitAmountCents * quantity across every line", () => {
  const lineItems = [
    lineItem({ name: "A", sku: "SKU-1", quantity: 3, unitAmountCents: 1299 }),
    lineItem({ name: "B", sku: "MISSING-1", quantity: 7, unitAmountCents: 45 }),
    lineItem({ name: "C", sku: null, quantity: 1, unitAmountCents: 100000 }),
    lineItem({ name: "D", sku: "SKU-1", quantity: 0, unitAmountCents: 5000 }),
  ];
  const plan = planShopifyDraftOrderLines({
    lineItems,
    variantsBySku: new Map([["SKU-1", [variant()]]]),
  });

  const expected = lineItems.reduce(
    (sum, item) => sum + item.unitAmountCents * item.quantity,
    0,
  );
  assert.equal(expected, 3897 + 315 + 100000);
  assert.equal(plan.totalCents, expected);
});

test("a mixed plan keeps line order, prices and SKUs while warning only on custom lines", () => {
  const matched = variant({ id: "gid://shopify/ProductVariant/100", sku: "MATCH-1" });
  const variantsBySku = new Map([
    ["MATCH-1", [matched]],
    ["AMBIG-1", [variant({ id: "gid://shopify/ProductVariant/200", sku: "AMBIG-1" }), variant({ id: "gid://shopify/ProductVariant/201", sku: "AMBIG-1" })]],
    ["ARCH-1", [variant({ id: "gid://shopify/ProductVariant/300", sku: "ARCH-1", productStatus: "ARCHIVED" })]],
    [
      "DENY-1",
      [
        variant({
          id: "gid://shopify/ProductVariant/400",
          sku: "DENY-1",
          tracked: true,
          inventoryPolicy: "DENY",
          inventoryQuantity: 1,
        }),
      ],
    ],
  ]);

  const lineItems = [
    { name: "Matched vault", sku: " MATCH-1 ", quantity: 2, unitAmountCents: 1250 },
    { name: "Freight surcharge", sku: null, quantity: 1, unitAmountCents: 500 },
    { name: "Unknown sleeves", sku: " MISSING-1 ", quantity: 3, unitAmountCents: 100 },
    { name: "Ambiguous playmat", sku: "AMBIG-1", quantity: 1, unitAmountCents: 999 },
    { name: "Archived binder", sku: "ARCH-1", quantity: 4, unitAmountCents: 250 },
    { name: "Back-ordered box", sku: "DENY-1", quantity: 5, unitAmountCents: 700 },
  ];

  const plan = planShopifyDraftOrderLines({ lineItems, variantsBySku });

  assert.deepEqual(
    plan.lines.map(({ mode, reason }) => [mode, reason]),
    [
      ["variant", "matched"],
      ["custom", "no_sku"],
      ["custom", "sku_not_found"],
      ["custom", "ambiguous_sku"],
      ["custom", "product_archived"],
      ["custom", "inventory_deny"],
    ],
  );

  assert.deepEqual(plan.lines[0], {
    mode: "variant",
    reason: "matched",
    name: "Matched vault",
    sku: "MATCH-1",
    quantity: 2,
    unitAmountCents: 1250,
    variantId: "gid://shopify/ProductVariant/100",
  });

  const customLines = plan.lines.filter((line) => line.mode === "custom");
  assert.deepEqual(
    customLines.map(({ name, sku, quantity, unitAmountCents, variantId }) => ({
      name,
      sku,
      quantity,
      unitAmountCents,
      variantId,
    })),
    [
      { name: "Freight surcharge", sku: null, quantity: 1, unitAmountCents: 500, variantId: null },
      { name: "Unknown sleeves", sku: "MISSING-1", quantity: 3, unitAmountCents: 100, variantId: null },
      { name: "Ambiguous playmat", sku: "AMBIG-1", quantity: 1, unitAmountCents: 999, variantId: null },
      { name: "Archived binder", sku: "ARCH-1", quantity: 4, unitAmountCents: 250, variantId: null },
      { name: "Back-ordered box", sku: "DENY-1", quantity: 5, unitAmountCents: 700, variantId: null },
    ],
  );

  assert.deepEqual(plan.warnings, [
    { sku: null, name: "Freight surcharge", reason: "no_sku" },
    { sku: "MISSING-1", name: "Unknown sleeves", reason: "sku_not_found" },
    { sku: "AMBIG-1", name: "Ambiguous playmat", reason: "ambiguous_sku" },
    { sku: "ARCH-1", name: "Archived binder", reason: "product_archived" },
    { sku: "DENY-1", name: "Back-ordered box", reason: "inventory_deny" },
  ]);

  assert.equal(plan.totalCents, 2500 + 500 + 300 + 999 + 1000 + 3500);
  assert.equal(
    plan.totalCents,
    lineItems.reduce((sum, item) => sum + item.unitAmountCents * item.quantity, 0),
  );
});

test("no line items produce an empty plan", () => {
  const plan = planShopifyDraftOrderLines({ lineItems: [], variantsBySku: new Map() });

  assert.deepEqual(plan, { lines: [], warnings: [], totalCents: 0 });
});
