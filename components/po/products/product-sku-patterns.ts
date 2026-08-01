export type ProductSkuPatternInput = {
  name: string;
  sku: string;
  categoryName?: string | null;
};

export type ProductSkuWarning = {
  id: string;
  message: string;
  expectedCodes: string[];
};

type CategoryRule = {
  id: string;
  matchesCategory: (categoryName: string) => boolean;
  matchesSku: (sku: string, segments: string[]) => boolean;
  message: string;
  expectedCodes: string[];
};

const SKU_PREFIX_RULES = {
  binder: ["L9PB-"],
  badFaithSleeves: ["BF-"],
  innerSleeves: ["IS-STD-"],
  playmat: ["UEPM-", "SGPM-", "DRGPM-"],
  radiantVault: ["R100-", "RDDB-", "SGDB-"],
  stainedGlassDeckBox: ["SGDB-"],
} as const;

const RADIANT_VAULT_COLOR_CODES: Record<string, string> = {
  black: "BK",
  blue: "BL",
  cream: "CR",
  green: "GR",
  pink: "PK",
  purple: "PL",
  red: "RD",
};

const INNER_SLEEVE_COLOR_CODES: Record<string, string> = {
  black: "BK",
  blue: "BL",
  cream: "CR",
  green: "GR",
  pink: "PK",
  purple: "PP",
  red: "RD",
  white: "WH",
};

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeSku(value: string) {
  return value.trim().toUpperCase();
}

function skuSegments(sku: string) {
  return sku.split(/[^A-Z0-9]+/).filter(Boolean);
}

function startsWithAny(sku: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => sku.startsWith(prefix));
}

function startsWithCategory(categoryName: string, prefix: string) {
  return categoryName.startsWith(prefix);
}

function isArtworkSleevesCategory(categoryName: string) {
  return (
    startsWithCategory(categoryName, "artwork sleeves") ||
    startsWithCategory(categoryName, "matte artwork sleeves")
  );
}

function isInnerSleevesCategory(categoryName: string) {
  return startsWithCategory(categoryName, "synergy inner sleeves");
}

function isRadiantVaultCategory(categoryName: string) {
  return startsWithCategory(categoryName, "radiant 100+ deck vault");
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    id: "category-9-pocket-binder",
    matchesCategory: (categoryName) =>
      startsWithCategory(categoryName, "9-pocket binder"),
    matchesSku: (sku) => startsWithAny(sku, SKU_PREFIX_RULES.binder),
    message: 'SKU usually starts with "L9PB-" for 9-Pocket Binder products.',
    expectedCodes: [...SKU_PREFIX_RULES.binder],
  },
  {
    id: "category-artwork-sleeves",
    matchesCategory: isArtworkSleevesCategory,
    matchesSku: (_sku, segments) => segments.includes("SLV"),
    message:
      'SKU usually contains the "SLV" segment for Artwork Sleeves products.',
    expectedCodes: ["SLV"],
  },
  {
    id: "category-bad-faith-sleeves",
    matchesCategory: (categoryName) =>
      startsWithCategory(categoryName, "bad faith sleeves"),
    matchesSku: (sku) =>
      startsWithAny(sku, SKU_PREFIX_RULES.badFaithSleeves),
    message: 'SKU usually starts with "BF-" for Bad Faith Sleeves products.',
    expectedCodes: [...SKU_PREFIX_RULES.badFaithSleeves],
  },
  {
    id: "category-synergy-inner-sleeves",
    matchesCategory: isInnerSleevesCategory,
    matchesSku: (sku) => startsWithAny(sku, SKU_PREFIX_RULES.innerSleeves),
    message:
      'SKU usually starts with "IS-STD-" for Synergy Inner Sleeves products.',
    expectedCodes: [...SKU_PREFIX_RULES.innerSleeves],
  },
  {
    id: "category-standard-playmat",
    matchesCategory: (categoryName) =>
      startsWithCategory(categoryName, "standard playmat"),
    matchesSku: (sku) => startsWithAny(sku, SKU_PREFIX_RULES.playmat),
    message:
      'SKU usually starts with "UEPM-", "SGPM-", or "DRGPM-" for Standard Playmat products.',
    expectedCodes: [...SKU_PREFIX_RULES.playmat],
  },
  {
    id: "category-radiant-vault",
    matchesCategory: isRadiantVaultCategory,
    matchesSku: (sku) => startsWithAny(sku, SKU_PREFIX_RULES.radiantVault),
    message:
      'SKU usually starts with "R100-", "RDDB-", or "SGDB-" for Radiant Deck Vault products.',
    expectedCodes: [...SKU_PREFIX_RULES.radiantVault],
  },
  {
    id: "category-stained-glass-deck-box",
    matchesCategory: (categoryName) =>
      startsWithCategory(
        categoryName,
        "stained glass radiant 100+ deck box",
      ),
    matchesSku: (sku) =>
      startsWithAny(sku, SKU_PREFIX_RULES.stainedGlassDeckBox),
    message:
      'SKU usually starts with "SGDB-" for Stained Glass Radiant Deck Box products.',
    expectedCodes: [...SKU_PREFIX_RULES.stainedGlassDeckBox],
  },
];

function radiantVaultColorWarning(
  name: string,
  skuSegmentsValue: string[],
): ProductSkuWarning | null {
  const match = name.match(
    /^(black|blue|cream|green|pink|purple|red)\s*-\s*deluxe\s*-\s*100\+\s*$/,
  );
  if (!match) return null;

  const color = match[1];
  const expectedCode = RADIANT_VAULT_COLOR_CODES[color];
  if (!expectedCode || skuSegmentsValue.includes(expectedCode)) return null;

  return {
    id: `radiant-vault-color-${color}`,
    message: `SKU usually contains the "${expectedCode}" segment for ${color} Radiant Deluxe vaults.`,
    expectedCodes: [expectedCode],
  };
}

function innerSleeveColorWarnings(
  name: string,
  skuSegmentsValue: string[],
): ProductSkuWarning[] {
  const warnings: ProductSkuWarning[] = [];

  for (const [color, expectedCode] of Object.entries(
    INNER_SLEEVE_COLOR_CODES,
  )) {
    const colorPattern = new RegExp(`\\b${color}\\b`);
    if (!colorPattern.test(name) || skuSegmentsValue.includes(expectedCode)) {
      continue;
    }

    warnings.push({
      id: `inner-sleeves-color-${color}`,
      message: `SKU usually contains the "${expectedCode}" segment for ${color} Synergy Inner Sleeves.`,
      expectedCodes: [expectedCode],
    });
  }

  return warnings;
}

export function getProductSkuWarnings({
  name,
  sku,
  categoryName,
}: ProductSkuPatternInput): ProductSkuWarning[] {
  const normalizedSku = normalizeSku(sku);
  if (!normalizedSku) return [];

  const normalizedName = normalizeText(name);
  const normalizedCategoryName = normalizeText(categoryName);
  const segments = skuSegments(normalizedSku);
  const warnings: ProductSkuWarning[] = [];

  const categoryRule = CATEGORY_RULES.find((rule) =>
    rule.matchesCategory(normalizedCategoryName),
  );
  if (categoryRule && !categoryRule.matchesSku(normalizedSku, segments)) {
    warnings.push({
      id: categoryRule.id,
      message: categoryRule.message,
      expectedCodes: categoryRule.expectedCodes,
    });
  }

  if (isRadiantVaultCategory(normalizedCategoryName)) {
    const colorWarning = radiantVaultColorWarning(normalizedName, segments);
    if (colorWarning) warnings.push(colorWarning);
  }

  if (isInnerSleevesCategory(normalizedCategoryName)) {
    warnings.push(...innerSleeveColorWarnings(normalizedName, segments));
  }

  return warnings;
}
