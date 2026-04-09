function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  if (!v || v.trim() === "") return undefined;
  return v.trim();
}

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * MinIO uses 9000 for the S3 API and 9001 for the web console by default.
 * Using :9001 in MINIO_* triggers "S3 API Requests must be made to API port."
 */
function normalizeMinioS3Endpoint(url: string): string {
  try {
    const u = new URL(url);
    if (u.port === "9001") {
      u.port = "9000";
      return u.href.replace(/\/$/, "");
    }
  } catch {
    /* leave unchanged */
  }
  return url;
}

export type ObjectStorageConfig = {
  /** S3 API endpoint reachable from the Next.js server (e.g. http://localhost:9000) */
  endpoint: string;
  /** Host used in presigned URLs when browsers must use a different host than the server */
  publicEndpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Max body size for server-side multipart uploads (bytes) */
  maxUploadBytes: number;
  /** Default TTL for presigned URLs (seconds) */
  presignExpiresSeconds: number;
};

let cached: ObjectStorageConfig | null = null;

export function getObjectStorageConfig(): ObjectStorageConfig {
  if (cached) return cached;

  const rawEndpoint = required("MINIO_ENDPOINT");
  const endpoint = normalizeMinioS3Endpoint(rawEndpoint);
  const publicRaw = optional("MINIO_PUBLIC_ENDPOINT") ?? rawEndpoint;
  const publicEndpoint = normalizeMinioS3Endpoint(publicRaw);

  cached = {
    endpoint,
    publicEndpoint,
    region: optional("MINIO_REGION") ?? "us-east-1",
    accessKeyId: required("MINIO_ACCESS_KEY"),
    secretAccessKey: required("MINIO_SECRET_KEY"),
    bucket: required("MINIO_BUCKET"),
    maxUploadBytes: parsePositiveInt("STORAGE_MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
    presignExpiresSeconds: parsePositiveInt("STORAGE_PRESIGN_EXPIRES_SECONDS", 900),
  };

  return cached;
}

export function isObjectStorageConfigured(): boolean {
  try {
    getObjectStorageConfig();
    return true;
  } catch {
    return false;
  }
}
