import { NextResponse } from "next/server";
import { z } from "zod";
import { DeepSeekRequestError } from "@/lib/assistant/deepseek";
import { checkAssistantRateLimit } from "@/lib/assistant/rate-limit";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import { extractPdfText } from "@/lib/pdf-text";
import { extractPurchaseOrderLinesFromPdfText } from "@/lib/po/pdf-line-extraction";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/storage";
import { storageObjectDisplayName } from "@/lib/storage/display-name";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

type MatchedLine = {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
};

type UnmatchedLine = {
  sku: string;
  quantity: number;
};

const MAX_PDF_BYTES = readPositiveIntEnv("PO_PDF_IMPORT_MAX_BYTES", 20 * 1024 * 1024);

const requestSchema = z.object({
  documentKey: z.string().min(1),
});

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasPdfExtension(value: string | null | undefined) {
  if (!value) return false;
  return /\.pdf(?:$|[?#])/i.test(value.trim());
}

function isPdfUpload(documentKey: string, contentType: string | null) {
  return (
    contentType?.toLowerCase().includes("application/pdf") ||
    hasPdfExtension(documentKey) ||
    hasPdfExtension(storageObjectDisplayName(documentKey))
  );
}

function normalizeSku(sku: string) {
  return sku.trim().toUpperCase();
}

function readAiErrorMessage(error: unknown) {
  if (error instanceof DeepSeekRequestError) return error.message;
  if (error instanceof z.ZodError) {
    return "AI returned a response the app could not read.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not extract purchase order lines from this PDF.";
}

export async function POST(request: Request) {
  const authz = await requireStoreContext();
  if (!authz.ok) return authz.response;
  const { userId, storeId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const rateLimit = checkAssistantRateLimit(`${userId}:${storeId}:po-pdf-import`);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        message: "Too many AI import requests. Please wait a moment and try again.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  let object: Awaited<ReturnType<typeof getObjectBuffer>>;
  try {
    object = await getObjectBuffer(parsed.data.documentKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read document";
    return jsonError(message, 502);
  }

  if (!isPdfUpload(parsed.data.documentKey, object.contentType)) {
    return jsonError("AI import is only available for PDF documents.", 400);
  }

  const size = object.contentLength ?? object.buffer.byteLength;
  if (size > MAX_PDF_BYTES) {
    return jsonError(`PDF is too large for AI import (max ${MAX_PDF_BYTES} bytes).`, 413);
  }

  let pdfText: string;
  try {
    const extracted = await extractPdfText(object.buffer);
    pdfText = extracted.text;
  } catch (error) {
    console.error("[po-pdf-import] PDF text extraction failed.", {
      documentKey: parsed.data.documentKey,
      contentType: object.contentType,
      byteLength: object.buffer.byteLength,
      error,
    });
    return jsonError("Could not read text from this PDF.", 422);
  }

  if (pdfText.length === 0) {
    return jsonError("This PDF does not contain readable text.", 422);
  }

  let extractedLines: Awaited<ReturnType<typeof extractPurchaseOrderLinesFromPdfText>>;
  try {
    extractedLines = await extractPurchaseOrderLinesFromPdfText(pdfText);
  } catch (error) {
    return jsonError(
      readAiErrorMessage(error),
      error instanceof DeepSeekRequestError ? error.status : 502,
    );
  }

  if (extractedLines.length === 0) {
    return jsonError("AI did not find any SKU quantities in this PDF.", 422);
  }

  const skus = extractedLines.map((line) => line.sku);
  const products = await prisma.product.findMany({
    where: {
      storeId,
      sku: { in: skus, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      sku: true,
    },
  });

  const productsBySku = new Map(products.map((product) => [normalizeSku(product.sku), product]));
  const lines: MatchedLine[] = [];
  const unmatched: UnmatchedLine[] = [];

  for (const extractedLine of extractedLines) {
    const product = productsBySku.get(normalizeSku(extractedLine.sku));
    if (!product) {
      unmatched.push(extractedLine);
      continue;
    }

    lines.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantity: extractedLine.quantity,
    });
  }

  return NextResponse.json({
    extracted: extractedLines,
    lines,
    unmatched,
  });
}
