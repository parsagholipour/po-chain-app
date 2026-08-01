import assert from "node:assert/strict";
import test from "node:test";
import { getProductSkuWarnings } from "./product-sku-patterns.ts";

const validCategoryCases = [
  ["9-Pocket Binder (360 Card Capacity)", "L9PB-BK-FR-24"],
  ["Artwork Sleeves", "AF-SLV-DS03"],
  [
    "Matte Artwork Sleeves 100 ct. (Standard Size)",
    "SLV-UE-CL",
  ],
  ["Bad Faith Sleeves", "BF-MS-OB100"],
  ["Synergy Inner Sleeves (Standard Size)", "IS-STD-BK"],
  ['Standard Playmat 24" x 14" (Stitched)', "UEPM-CL"],
  ['Standard Playmat 24" x 14" (Stitched)', "SGPM-02-BK-23"],
  ['Standard Playmat 24" x 14" (Stitched)', "DRGPM-FR-003"],
  ["Radiant 100+ Deck Vault", "R100-BK-DLX"],
  ["Radiant 100+ Deck Vault", "RDDB-CL-DLX"],
  ["Radiant 100+ Deck Vault", "SGDB-02-BK-23"],
  ["Stained Glass Radiant 100+ Deck Box", "SGDB-02-BK-23"],
  [
    "Stained Glass Radiant 100+ Deck Box (with videos)",
    "SGDB-02-BK-23",
  ],
];

test("accepts every supported category SKU family", () => {
  for (const [categoryName, sku] of validCategoryCases) {
    assert.deepEqual(
      getProductSkuWarnings({ name: "Catalog product", sku, categoryName }),
      [],
      `${categoryName}: ${sku}`,
    );
  }
});

const validRadiantColors = [
  ["Black", "BK"],
  ["Blue", "BL"],
  ["Cream", "CR"],
  ["Green", "GR"],
  ["Pink", "PK"],
  ["Purple", "PL"],
  ["Red", "RD"],
];

test("accepts conservative plain Radiant Deluxe color codes", () => {
  for (const [color, code] of validRadiantColors) {
    assert.deepEqual(
      getProductSkuWarnings({
        name: `${color} - Deluxe - 100+`,
        sku: `R100-${code}-DLX`,
        categoryName: "Radiant 100+ Deck Vault",
      }),
      [],
      color,
    );
  }
});

const validInnerSleeveColors = [
  ["Pitch Black", "BK"],
  ["Blue Ocean", "BL"],
  ["Cream Dream", "CR"],
  ["Green Grove", "GR"],
  ["Pink Blossom", "PK"],
  ["Phantom Purple", "PP"],
  ["Red Ember", "RD"],
  ["White Radiance", "WH"],
];

test("accepts conservative Synergy Inner Sleeve color codes", () => {
  for (const [name, code] of validInnerSleeveColors) {
    assert.deepEqual(
      getProductSkuWarnings({
        name,
        sku: `IS-STD-${code}`,
        categoryName: "Synergy Inner Sleeves (Standard Size)",
      }),
      [],
      name,
    );
  }
});

test("returns structured category and color warnings", () => {
  const warnings = getProductSkuWarnings({
    name: "Pitch Black",
    sku: "SLV-STD-BL",
    categoryName: "Synergy Inner Sleeves (Standard Size)",
  });

  assert.deepEqual(
    warnings.map(({ id, expectedCodes }) => ({ id, expectedCodes })),
    [
      {
        id: "category-synergy-inner-sleeves",
        expectedCodes: ["IS-STD-"],
      },
      {
        id: "inner-sleeves-color-black",
        expectedCodes: ["BK"],
      },
    ],
  );
});

test("uses BK for Black and BL for Blue", () => {
  assert.deepEqual(
    getProductSkuWarnings({
      name: "Black - Deluxe - 100+",
      sku: "R100-BL-DLX",
      categoryName: "Radiant 100+ Deck Vault",
    }).map((warning) => warning.id),
    ["radiant-vault-color-black"],
  );
});

test("matches case-insensitively and accepts variant suffixes", () => {
  assert.deepEqual(
    getProductSkuWarnings({
      name: "catalog product",
      sku: "af-slv-ds03__variant_51972225925443",
      categoryName: "matte artwork sleeves 100 CT. (standard size)",
    }),
    [],
  );
});

test("requires complete SKU segments rather than loose substrings", () => {
  assert.deepEqual(
    getProductSkuWarnings({
      name: "Catalog product",
      sku: "AF-XSLVY-DS03",
      categoryName: "Artwork Sleeves",
    }).map((warning) => warning.id),
    ["category-artwork-sleeves"],
  );
});

test("does not warn for blank SKUs or unknown categories", () => {
  assert.deepEqual(
    getProductSkuWarnings({
      name: "Catalog product",
      sku: "",
      categoryName: "Artwork Sleeves",
    }),
    [],
  );
  assert.deepEqual(
    getProductSkuWarnings({
      name: "Catalog product",
      sku: "CUSTOM-001",
      categoryName: "Unmapped Category",
    }),
    [],
  );
});

test("does not infer a color for legacy artwork product lines", () => {
  assert.deepEqual(
    getProductSkuWarnings({
      name: "Black - Cursed Lotus",
      sku: "SLV-UE-CL",
      categoryName: "Matte Artwork Sleeves 100 ct. (Standard Size)",
    }),
    [],
  );
});
