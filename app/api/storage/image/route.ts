import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { getObjectStorageConfig } from "@/lib/storage/config";
import { getObjectBuffer, getObjectMetadata } from "@/lib/storage/file-storage";
import { s3ObjectKeyFromStoredValue } from "@/lib/storage/storage-key";

export const runtime = "nodejs";

const DEFAULT_WIDTH = 384;
const MIN_WIDTH = 32;
const MAX_WIDTH = 1600;
const DEFAULT_QUALITY = 90;
const CACHE_VERSION = 1;
const CACHE_DIR = path.join(/*turbopackIgnore: true*/ tmpdir(), "po-app-storage-image-cache");

type ImageCacheState = "optimized" | "original";

type CacheMetadata = {
  version: number;
  contentType: string;
  cacheState: ImageCacheState;
  sourceSize: number;
  bodyLength: number;
  createdAt: string;
};

function boundedInt(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function outputFormat(accept: string | null, contentType: string): "webp" | "jpeg" | "png" {
  if (accept?.includes("image/webp")) return "webp";
  if (["image/png", "image/gif", "image/webp", "image/svg+xml"].includes(contentType)) {
    return "png";
  }
  return "jpeg";
}

function contentTypeForFormat(format: "webp" | "jpeg" | "png"): string {
  if (format === "webp") return "image/webp";
  if (format === "png") return "image/png";
  return "image/jpeg";
}

function imageResponse(
  body: Buffer,
  contentType: string,
  cacheState: ImageCacheState,
  localCache: "hit" | "miss",
): Response {
  const responseBody = new ArrayBuffer(body.byteLength);
  new Uint8Array(responseBody).set(body);
  return new Response(responseBody, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      "Vary": "Accept",
      "X-Content-Type-Options": "nosniff",
      "X-Storage-Image-Cache": localCache,
      "X-Storage-Image": cacheState,
    },
  });
}

function cacheKeyFor(input: {
  objectKey: string;
  sourceSize: number;
  sourceContentType: string;
  outputFormat: "webp" | "jpeg" | "png";
  width: number;
  quality: number;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: CACHE_VERSION,
        objectKey: input.objectKey,
        sourceSize: input.sourceSize,
        sourceContentType: input.sourceContentType,
        outputFormat: input.outputFormat,
        width: input.width,
        quality: input.quality,
      }),
    )
    .digest("hex");
}

function cachePaths(cacheKey: string) {
  return {
    body: path.join(/*turbopackIgnore: true*/ CACHE_DIR, `${cacheKey}.bin`),
    meta: path.join(/*turbopackIgnore: true*/ CACHE_DIR, `${cacheKey}.json`),
  };
}

async function readCachedImage(
  cacheKey: string,
  sourceSize: number,
): Promise<{ buffer: Buffer; metadata: CacheMetadata } | null> {
  const paths = cachePaths(cacheKey);
  try {
    const [rawMetadata, bodyStat] = await Promise.all([
      readFile(/*turbopackIgnore: true*/ paths.meta, "utf8"),
      stat(/*turbopackIgnore: true*/ paths.body),
    ]);
    const metadata = JSON.parse(rawMetadata) as CacheMetadata;
    if (
      metadata.version !== CACHE_VERSION ||
      metadata.sourceSize !== sourceSize ||
      metadata.bodyLength !== bodyStat.size
    ) {
      return null;
    }
    const buffer = await readFile(/*turbopackIgnore: true*/ paths.body);
    return { buffer, metadata };
  } catch {
    return null;
  }
}

async function writeCachedImage(
  cacheKey: string,
  body: Buffer,
  metadata: Omit<CacheMetadata, "bodyLength" | "createdAt" | "version">,
): Promise<void> {
  const paths = cachePaths(cacheKey);
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tmpBody = `${paths.body}.${suffix}.tmp`;
  const tmpMeta = `${paths.meta}.${suffix}.tmp`;
  const fullMetadata: CacheMetadata = {
    ...metadata,
    version: CACHE_VERSION,
    bodyLength: body.byteLength,
    createdAt: new Date().toISOString(),
  };

  try {
    await mkdir(/*turbopackIgnore: true*/ CACHE_DIR, { recursive: true });
    await Promise.all([
      writeFile(/*turbopackIgnore: true*/ tmpBody, body),
      writeFile(/*turbopackIgnore: true*/ tmpMeta, JSON.stringify(fullMetadata)),
    ]);
    await Promise.all([
      rename(/*turbopackIgnore: true*/ tmpBody, paths.body),
      rename(/*turbopackIgnore: true*/ tmpMeta, paths.meta),
    ]);
  } catch {
    /* Cache failures should not break image rendering. */
  }
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    getObjectStorageConfig();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Storage is not configured";
    return NextResponse.json({ message }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key || key.length > 1200) {
    return NextResponse.json({ message: "Missing or invalid query param: key" }, { status: 400 });
  }

  const width = boundedInt(
    searchParams.get("width") ?? searchParams.get("w"),
    DEFAULT_WIDTH,
    MIN_WIDTH,
    MAX_WIDTH,
  );
  const quality = boundedInt(searchParams.get("quality"), DEFAULT_QUALITY, 1, 100);

  let objectMetadata;
  try {
    objectMetadata = await getObjectMetadata(key);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load image";
    return NextResponse.json({ message }, { status: 502 });
  }

  const originalContentType = objectMetadata.contentType ?? "application/octet-stream";
  if (!originalContentType.startsWith("image/")) {
    return NextResponse.json({ message: "Object is not an image" }, { status: 415 });
  }

  const sourceSize = objectMetadata.contentLength;
  const format = outputFormat(request.headers.get("accept"), originalContentType);
  const objectKey = s3ObjectKeyFromStoredValue(key);
  const cacheKey =
    typeof sourceSize === "number"
      ? cacheKeyFor({
          objectKey,
          sourceSize,
          sourceContentType: originalContentType,
          outputFormat: format,
          width,
          quality,
        })
      : null;

  if (cacheKey && sourceSize !== null) {
    const cached = await readCachedImage(cacheKey, sourceSize);
    if (cached) {
      return imageResponse(
        cached.buffer,
        cached.metadata.contentType,
        cached.metadata.cacheState,
        "hit",
      );
    }
  }

  let stored;
  try {
    stored = await getObjectBuffer(key);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load image";
    return NextResponse.json({ message }, { status: 502 });
  }

  try {
    const source = sharp(stored.buffer, {
      animated: false,
      failOn: "none",
    }).rotate();
    const contentType = contentTypeForFormat(format);

    let pipeline = source.resize({
      width,
      withoutEnlargement: true,
    });

    if (format === "webp") {
      pipeline = pipeline.webp({ quality, effort: 4 });
    } else if (format === "png") {
      pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
    } else {
      pipeline = pipeline.flatten({ background: "#fff" }).jpeg({
        quality,
        mozjpeg: true,
      });
    }

    const optimized = await pipeline.toBuffer();
    const originalLength = sourceSize ?? stored.contentLength ?? stored.buffer.byteLength;
    if (optimized.byteLength >= originalLength) {
      if (cacheKey && sourceSize !== null) {
        await writeCachedImage(cacheKey, stored.buffer, {
          contentType: originalContentType,
          cacheState: "original",
          sourceSize,
        });
      }
      return imageResponse(stored.buffer, originalContentType, "original", "miss");
    }

    if (cacheKey && sourceSize !== null) {
      await writeCachedImage(cacheKey, optimized, {
        contentType,
        cacheState: "optimized",
        sourceSize,
      });
    }

    return imageResponse(optimized, contentType, "optimized", "miss");
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not optimize image";
    return NextResponse.json({ message }, { status: 502 });
  }
}
