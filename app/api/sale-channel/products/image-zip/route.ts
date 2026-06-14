import { NextResponse } from "next/server";
import { strToU8, zipSync, type Zippable } from "fflate";
import { z } from "zod";
import { jsonError, jsonFromZod } from "@/lib/json-error";
import { prisma } from "@/lib/prisma";
import { requireStoreContext } from "@/lib/store-context";

export const runtime = "nodejs";

const requestSchema = z.object({
  productIds: z.array(z.uuid()).min(1).max(200),
});

const downloadTimeoutMs = 30_000;

const extensionByContentType: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/tiff": ".tiff",
  "image/webp": ".webp",
};

function extractUrls(value: string) {
  const matches = value.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return Array.from(
    new Set(
      matches
        .map((url) => url.replace(/[),.;]+$/g, ""))
        .filter((url) => {
          try {
            const parsed = new URL(url);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
          } catch {
            return false;
          }
        }),
    ),
  );
}

function isGoogleDriveUrl(url: URL) {
  return (
    url.hostname === "drive.google.com" ||
    url.hostname === "docs.google.com" ||
    url.hostname === "drive.usercontent.google.com" ||
    url.hostname === "googleusercontent.com" ||
    url.hostname.endsWith(".googleusercontent.com")
  );
}

function googleDriveFileId(url: URL) {
  const id = url.searchParams.get("id");
  if (id) return id;

  return (
    url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ??
    url.pathname.match(/\/d\/([^/]+)/)?.[1] ??
    null
  );
}

function normalizeDownloadUrl(value: string) {
  const url = new URL(value);
  const driveFileId = isGoogleDriveUrl(url) ? googleDriveFileId(url) : null;

  if (!driveFileId) return value;
  const downloadUrl = new URL("https://drive.google.com/uc");
  downloadUrl.searchParams.set("export", "download");
  downloadUrl.searchParams.set("id", driveFileId);
  return downloadUrl.toString();
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlAttribute(tag: string, name: string) {
  const quoted = tag.match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  if (quoted) return decodeHtmlAttribute(quoted[2]);

  const bare = tag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return bare ? decodeHtmlAttribute(bare[1]) : null;
}

function googleDriveConfirmationUrl(html: string, baseUrl: string) {
  const directHref = html.match(/href=(["'])([^"']*(?:uc|download)[^"']*confirm=[^"']*)\1/i);
  if (directHref?.[2]) return new URL(decodeHtmlAttribute(directHref[2]), baseUrl).toString();

  const form = html.match(/<form\b[\s\S]*?<\/form>/i)?.[0];
  if (!form) return null;

  const action = htmlAttribute(form, "action");
  if (!action) return null;

  const url = new URL(action, baseUrl);
  for (const input of form.matchAll(/<input\b[^>]*>/gi)) {
    const name = htmlAttribute(input[0], "name");
    if (!name) continue;
    url.searchParams.set(name, htmlAttribute(input[0], "value") ?? "");
  }

  return url.toString();
}

function filenameFromContentDisposition(value: string | null) {
  if (!value) return null;

  const encoded = value.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ""));
    } catch {
      return encoded.trim().replace(/^"|"$/g, "");
    }
  }

  return value.match(/filename\s*=\s*("[^"]+"|[^;]+)/i)?.[1]?.trim().replace(/^"|"$/g, "") ?? null;
}

function extensionFromFilename(value: string | null) {
  return value?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[0].toLowerCase() ?? null;
}

function extensionFromUrl(value: string) {
  try {
    const url = new URL(value);
    return extensionFromFilename(url.pathname);
  } catch {
    return null;
  }
}

function extensionForDownload(response: Response, sourceUrl: string) {
  const contentDisposition = response.headers.get("content-disposition");
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();

  return (
    extensionFromFilename(filenameFromContentDisposition(contentDisposition)) ??
    (contentType ? extensionByContentType[contentType] : null) ??
    extensionFromUrl(response.url) ??
    extensionFromUrl(sourceUrl) ??
    ".bin"
  );
}

function isHtmlDownloadResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("text/html") && !response.headers.get("content-disposition");
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), downloadTimeoutMs);

  try {
    return await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PO-app product image downloader)",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadLinkedFile(sourceUrl: string) {
  if (!isGoogleDriveUrl(new URL(sourceUrl))) {
    throw new Error("Only Google Drive image links are supported");
  }

  const downloadUrl = normalizeDownloadUrl(sourceUrl);
  let response = await fetchWithTimeout(downloadUrl);

  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}`);
  }

  if (isHtmlDownloadResponse(response)) {
    const html = await response.text();
    const confirmationUrl = googleDriveConfirmationUrl(html, response.url);

    if (confirmationUrl) {
      response = await fetchWithTimeout(confirmationUrl);
      if (!response.ok) {
        throw new Error(`Download failed with HTTP ${response.status}`);
      }
      if (isHtmlDownloadResponse(response)) {
        throw new Error("Google Drive did not return a downloadable file");
      }
    } else {
      throw new Error("Google Drive did not return a downloadable file");
    }
  }

  return {
    data: new Uint8Array(await response.arrayBuffer()),
    extension: extensionForDownload(response, sourceUrl),
  };
}

function sanitizePathSegment(value: string, fallback: string) {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 120);

  return cleaned || fallback;
}

function uniqueFolderName(sku: string, usedFolderNames: Set<string>) {
  const baseName = sanitizePathSegment(sku, "product");
  let folderName = baseName;
  let suffix = 2;

  while (usedFolderNames.has(folderName.toLowerCase())) {
    folderName = `${baseName}-${suffix}`;
    suffix += 1;
  }

  usedFolderNames.add(folderName.toLowerCase());
  return folderName;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown download error";
}

function zipFileName() {
  return `sale-channel-product-images-${new Date().toISOString().slice(0, 10)}.zip`;
}

export async function POST(request: Request) {
  const authz = await requireStoreContext({ allowDistributor: true });
  if (!authz.ok) return authz.response;
  const { storeId } = authz.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonFromZod(parsed.error);

  const productIds = Array.from(new Set(parsed.data.productIds));
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      storeId,
      editingStatus: { not: "discontinued" },
    },
    select: {
      id: true,
      sku: true,
      imageLink: true,
    },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));
  const orderedProducts = productIds
    .map((id) => productsById.get(id))
    .filter((product): product is NonNullable<typeof product> => Boolean(product));

  if (orderedProducts.length === 0) {
    return jsonError("No selected products were found", 404);
  }

  const archive: Zippable = {};
  const usedFolderNames = new Set<string>();
  const warnings: string[] = [];
  let downloadedFileCount = 0;

  for (const product of orderedProducts) {
    const folderName = uniqueFolderName(product.sku, usedFolderNames);
    const folder: Zippable = {};
    archive[folderName] = folder;

    const links = extractUrls(product.imageLink);
    const safeSku = sanitizePathSegment(product.sku, "product");
    let counter = 0;

    for (const link of links) {
      try {
        const file = await downloadLinkedFile(link);
        folder[`${safeSku}_${counter}${file.extension}`] = file.data;
        counter += 1;
        downloadedFileCount += 1;
      } catch (error) {
        warnings.push(`${product.sku}: ${link} (${errorMessage(error)})`);
      }
    }
  }

  if (downloadedFileCount === 0) {
    return jsonError("No files could be downloaded from the selected image links", 422);
  }

  if (warnings.length > 0) {
    archive["_download-warnings.txt"] = strToU8(`${warnings.join("\n")}\n`);
  }

  const zip = zipSync(archive, { level: 0 });

  return new NextResponse(zip, {
    headers: {
      "Content-Disposition": `attachment; filename="${zipFileName()}"`,
      "Content-Type": "application/zip",
      "X-Download-Warning-Count": String(warnings.length),
    },
  });
}
