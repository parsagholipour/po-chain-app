import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getObjectStorageConfig } from "@/lib/storage/config";
import { getPresignS3Client, getS3Client } from "@/lib/storage/s3-client";
import { s3ObjectKeyFromStoredValue } from "@/lib/storage/storage-key";

const DEFAULT_PREFIX = "uploads";

function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").replace(/\0/g, "");
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "file";
}

export function buildObjectKey(originalName: string, prefix = DEFAULT_PREFIX): string {
  const id = crypto.randomUUID();
  const safe = sanitizeFilename(originalName);
  return `${prefix.replace(/\/+$/, "")}/${id}-${safe}`;
}

let bucketEnsured: string | null = null;

export async function ensureBucket(): Promise<void> {
  const cfg = getObjectStorageConfig();
  if (bucketEnsured === cfg.bucket) return;

  const client = getS3Client();
  try {
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
  }

  bucketEnsured = cfg.bucket;
}

export type UploadedObject = {
  bucket: string;
  key: string;
  contentType: string;
  size: number;
};

export async function putObject(params: {
  key: string;
  body: PutObjectCommandInput["Body"];
  contentType: string;
  cacheControl?: string;
}): Promise<void> {
  const cfg = getObjectStorageConfig();
  await ensureBucket();

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: params.cacheControl,
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  const cfg = getObjectStorageConfig();
  const objectKey = s3ObjectKeyFromStoredValue(key);
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
    }),
  );
}

/** Presigned PUT for direct browser → MinIO uploads. */
export async function getPresignedPutUrl(key: string, contentType: string): Promise<string> {
  const cfg = getObjectStorageConfig();
  await ensureBucket();

  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(getPresignS3Client(), command, {
    expiresIn: cfg.presignExpiresSeconds,
  });
}

/** Time-limited read URL (private buckets). */
export async function getPresignedGetUrl(key: string): Promise<string> {
  const cfg = getObjectStorageConfig();
  const objectKey = s3ObjectKeyFromStoredValue(key);
  const command = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key: objectKey,
  });

  return getSignedUrl(getPresignS3Client(), command, {
    expiresIn: cfg.presignExpiresSeconds,
  });
}
