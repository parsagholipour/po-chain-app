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

function mergeDuplicateSkus(items: ExtractedPurchaseOrderLine[]) {
  const bySku = new Map<string, ExtractedPurchaseOrderLine>();

  for (const item of items) {
    const sku = item.sku.trim();
    const key = sku.toUpperCase();
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

  const response = await createDeepSeekChatCompletion({
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "Extract purchase order line items from PDF text.",
          "Return only valid JSON in this exact shape: {\"items\":[{\"sku\":\"...\",\"quantity\":1}]}",
          "Use the item SKU exactly as printed, usually the token before '--' in a line item.",
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
  return mergeDuplicateSkus(parsed.items);
}
