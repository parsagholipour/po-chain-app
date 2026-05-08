import "server-only";

import { z } from "zod";
import { createDeepSeekChatCompletion } from "@/lib/assistant/deepseek";

const MAX_PDF_TEXT_CHARS = readPositiveIntEnv("PO_PDF_IMPORT_MAX_TEXT_CHARS", 24_000);

const quantitySchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.replace(/,/g, "").trim();
  return normalized.length > 0 ? Number(normalized) : value;
}, z.number().int().positive());

const extractedLineSchema = z.object({
  sku: z.string().trim().min(1).max(120),
  quantity: quantitySchema,
});

const extractionSchema = z.object({
  items: z.array(extractedLineSchema).default([]),
});

export type ExtractedPurchaseOrderLine = z.infer<typeof extractedLineSchema>;

type SkuLabelKind = "alternate" | "supplier";

type LabeledSkuValue = {
  kind: SkuLabelKind;
  value: string;
  lineIndex: number;
  columnIndex: number;
};

const SKU_LABEL_PATTERN =
  /\b(Supplier\s*SKU|(?:(?!(?:SKU|SUPPLIER|AMOUNT|TAX|NET|PRICE|ORDERED|QTY|QUANTITY|DESCRIPTION|RECEIPT|DATE|COMMENT)\b)[A-Za-z0-9][A-Za-z0-9&'./()#-]*\s+){1,6}SKU)\b(?=[\s:#=]|$)/i;
const SKU_LABEL_MATCH_PATTERN =
  /\b(Supplier\s*SKU|(?:(?!(?:SKU|SUPPLIER|AMOUNT|TAX|NET|PRICE|ORDERED|QTY|QUANTITY|DESCRIPTION|RECEIPT|DATE|COMMENT)\b)[A-Za-z0-9][A-Za-z0-9&'./()#-]*\s+){1,6}SKU)\b(?=[\s:#=]|$)/gi;
const SKU_VALUE_PATTERN = /[A-Za-z0-9][A-Za-z0-9._/#-]*/g;
const SKU_TABLE_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/#-]*$/;
const SUPPLIER_SKU_PAIRING_LINE_WINDOW = 8;
const IGNORED_SKU_VALUE_TOKENS = new Set([
  "SKU",
  "SUPPLIER",
  "X",
  "QTY",
  "QUANTITY",
  "UNIT",
  "PRICE",
  "TOTAL",
  "DESCRIPTION",
]);

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function compactPdfText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, MAX_PDF_TEXT_CHARS);
}

function parseJsonFromAssistant(text: string): unknown {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("AI response did not contain JSON");
    }
    return JSON.parse(withoutFence.slice(start, end + 1));
  }
}

function coerceExtractionPayload(payload: unknown) {
  return Array.isArray(payload) ? { items: payload } : payload;
}

function normalizeSkuKey(sku: string) {
  return sku.trim().toUpperCase();
}

function readSkuLabelKind(label: string): SkuLabelKind {
  return /^SUPPLIER\s*SKU$/i.test(label.trim()) ? "supplier" : "alternate";
}

function extractSkuCandidate(valueText: string) {
  const cleaned = valueText.trim().replace(/^[:#=,\-]+/, "").trim();

  for (const match of cleaned.matchAll(SKU_VALUE_PATTERN)) {
    const value = match[0].trim();
    if (!value) continue;
    if (IGNORED_SKU_VALUE_TOKENS.has(value.toUpperCase())) continue;
    return value;
  }

  return null;
}

function extractNextLineSkuCandidate(lines: string[], lineIndex: number) {
  for (let offset = 1; offset <= 2; offset += 1) {
    const line = lines[lineIndex + offset]?.trim();
    if (!line) continue;
    if (SKU_LABEL_PATTERN.test(line)) return null;
    return extractSkuCandidate(line);
  }

  return null;
}

function findLabeledSkuValues(text: string) {
  const lines = text.split(/\r?\n/);
  const values: LabeledSkuValue[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const matches = Array.from(line.matchAll(SKU_LABEL_MATCH_PATTERN));
    if (matches.length === 0) continue;

    for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
      const match = matches[matchIndex];
      const columnIndex = match.index ?? 0;
      const label = match[1] ?? "";
      const valueStart = columnIndex + match[0].length;
      const valueEnd = matches[matchIndex + 1]?.index ?? line.length;
      const inlineValue = extractSkuCandidate(line.slice(valueStart, valueEnd));
      const fallbackValue =
        matches.length === 1 ? extractNextLineSkuCandidate(lines, lineIndex) : null;
      const value = inlineValue ?? fallbackValue;

      if (!value) continue;

      values.push({
        kind: readSkuLabelKind(label),
        value,
        lineIndex,
        columnIndex,
      });
    }
  }

  return values;
}

function isLikelySkuTableValue(value: string) {
  const normalized = value.trim().replace(/[,.]+$/, "");
  if (!SKU_TABLE_VALUE_PATTERN.test(normalized)) return false;
  if (IGNORED_SKU_VALUE_TOKENS.has(normalized.toUpperCase())) return false;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(normalized)) return false;
  if (/^\$?\d+(?:,\d{3})*(?:\.\d+)?$/.test(normalized)) return false;
  return true;
}

function hasNumericTableValue(tokens: string[]) {
  return tokens.some((token) => /^\$?\d+(?:,\d{3})*(?:\.\d+)?$/.test(token));
}

function hasSupplierSkuTableHeader(line: string) {
  const labelKinds = Array.from(line.matchAll(SKU_LABEL_MATCH_PATTERN)).map((match) =>
    readSkuLabelKind(match[1] ?? ""),
  );

  return labelKinds.includes("supplier") && labelKinds.includes("alternate");
}

function readSupplierSkuTableRow(line: string) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 4 || !hasNumericTableValue(tokens)) return null;

  const supplierSku = tokens[0];
  const alternateSku = tokens[tokens.length - 1];
  const quantity = tokens
    .slice(1, -1)
    .map((token) => token.replace(/,/g, ""))
    .find((token) => /^\d+$/.test(token));

  if (!quantity) return null;
  if (!isLikelySkuTableValue(alternateSku) || !isLikelySkuTableValue(supplierSku)) {
    return null;
  }
  if (normalizeSkuKey(alternateSku) === normalizeSkuKey(supplierSku)) return null;

  return { alternateSku, supplierSku, quantity: Number(quantity) };
}

function readSupplierSkuTableRows(text: string) {
  const lines = text.split(/\r?\n/);
  const rows: Array<{
    alternateSku: string;
    supplierSku: string;
    quantity: number;
  }> = [];
  let isInSupplierSkuTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (hasSupplierSkuTableHeader(trimmed)) {
      isInSupplierSkuTable = true;
      continue;
    }

    if (!isInSupplierSkuTable) continue;

    if (/^(?:Purchase Order Total|Page \d+ of \d+|-- )/i.test(trimmed)) {
      isInSupplierSkuTable = false;
      continue;
    }

    const row = readSupplierSkuTableRow(trimmed);
    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

function buildSupplierSkuTableOverrides(text: string) {
  const overrides = new Map<string, string>();

  for (const row of readSupplierSkuTableRows(text)) {
    overrides.set(normalizeSkuKey(row.alternateSku), row.supplierSku);
  }

  return overrides;
}

function extractSupplierSkuTableLines(text: string): ExtractedPurchaseOrderLine[] {
  return readSupplierSkuTableRows(text).map((row) => ({
    sku: row.supplierSku,
    quantity: row.quantity,
  }));
}

function buildSupplierSkuLabelOverrides(text: string) {
  const labeledValues = findLabeledSkuValues(text);
  const alternateSkuValues = labeledValues.filter((entry) => entry.kind === "alternate");
  const supplierSkuValues = labeledValues.filter((entry) => entry.kind === "supplier");
  const overrides = new Map<string, string>();

  for (const alternateSku of alternateSkuValues) {
    const alternateKey = normalizeSkuKey(alternateSku.value);
    const nearestSupplier = supplierSkuValues
      .filter((supplierSku) => {
        const lineDistance = Math.abs(supplierSku.lineIndex - alternateSku.lineIndex);
        return (
          lineDistance <= SUPPLIER_SKU_PAIRING_LINE_WINDOW &&
          normalizeSkuKey(supplierSku.value) !== alternateKey
        );
      })
      .sort((left, right) => {
        const leftLineDistance = Math.abs(left.lineIndex - alternateSku.lineIndex);
        const rightLineDistance = Math.abs(right.lineIndex - alternateSku.lineIndex);
        if (leftLineDistance !== rightLineDistance) {
          return leftLineDistance - rightLineDistance;
        }

        return (
          Math.abs(left.columnIndex - alternateSku.columnIndex) -
          Math.abs(right.columnIndex - alternateSku.columnIndex)
        );
      })[0];

    if (nearestSupplier) {
      overrides.set(alternateKey, nearestSupplier.value);
    }
  }

  return overrides;
}

function buildSupplierSkuOverrides(text: string) {
  return new Map([
    ...buildSupplierSkuLabelOverrides(text),
    ...buildSupplierSkuTableOverrides(text),
  ]);
}

function preferSupplierSkus(
  items: ExtractedPurchaseOrderLine[],
  text: string,
): ExtractedPurchaseOrderLine[] {
  const supplierOverrides = buildSupplierSkuOverrides(text);
  if (supplierOverrides.size === 0) return items;

  const originalSkuKeys = new Set(items.map((item) => normalizeSkuKey(item.sku)));
  const preferredItems: ExtractedPurchaseOrderLine[] = [];

  for (const item of items) {
    const supplierSku = supplierOverrides.get(normalizeSkuKey(item.sku));
    if (!supplierSku) {
      preferredItems.push(item);
      continue;
    }

    if (originalSkuKeys.has(normalizeSkuKey(supplierSku))) {
      continue;
    }

    preferredItems.push({ ...item, sku: supplierSku });
  }

  return preferredItems;
}

function mergeDuplicateSkus(items: ExtractedPurchaseOrderLine[]) {
  const bySku = new Map<string, ExtractedPurchaseOrderLine>();

  for (const item of items) {
    const sku = item.sku.trim();
    const key = normalizeSkuKey(sku);
    const existing = bySku.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      bySku.set(key, { sku, quantity: item.quantity });
    }
  }

  return Array.from(bySku.values());
}

export async function extractPurchaseOrderLinesFromPdfText(
  pdfText: string,
): Promise<ExtractedPurchaseOrderLine[]> {
  const compactText = compactPdfText(pdfText);
  if (compactText.length === 0) {
    return [];
  }

  const supplierSkuTableLines = extractSupplierSkuTableLines(compactText);
  if (supplierSkuTableLines.length > 0) {
    return mergeDuplicateSkus(supplierSkuTableLines);
  }

  const response = await createDeepSeekChatCompletion({
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "Extract purchase order line items from PDF text.",
          "Return only valid JSON in this exact shape: {\"items\":[{\"sku\":\"...\",\"quantity\":1}]}",
          "Use the item SKU exactly as printed, usually the token before '--' in a line item.",
          "If both Supplier SKU and another SKU label are shown for the same product, use Supplier SKU and ignore the other SKU.",
          "If a table has separate Supplier SKU and other SKU rows or columns, choose the value under Supplier SKU.",
          "When Supplier SKU and another SKU label appear on nearby rows for one product, return only the Supplier SKU row.",
          "Use the ordered quantity from the QTY column only; do not use unit price, extended price, totals, page numbers, order numbers, dates, or invoice numbers.",
          "If a product spans multiple text lines, still return the SKU and quantity.",
          "If the same SKU appears multiple times, include it once with the summed quantity.",
          "Omit uncertain rows instead of guessing.",
        ].join(" "),
      },
      {
        role: "user",
        content: `PDF text:\n\n${compactText}`,
      },
    ],
  });

  const payload = coerceExtractionPayload(parseJsonFromAssistant(response.content ?? ""));
  const parsed = extractionSchema.parse(payload);
  return mergeDuplicateSkus(preferSupplierSkus(parsed.items, compactText));
}
