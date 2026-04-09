import { S3Client } from "@aws-sdk/client-s3";
import { getObjectStorageConfig } from "@/lib/storage/config";

let serverClient: S3Client | null = null;
let presignClient: S3Client | null = null;

function createClient(endpoint: string): S3Client {
  const cfg = getObjectStorageConfig();
  return new S3Client({
    region: cfg.region,
    endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

/** S3 API as seen from the Next.js server (often a Docker-internal hostname). */
export function getS3Client(): S3Client {
  if (!serverClient) {
    serverClient = createClient(getObjectStorageConfig().endpoint);
  }
  return serverClient;
}

/**
 * S3 API host embedded in presigned URLs. Use a browser-reachable URL when it
 * differs from {@link getObjectStorageConfig}.endpoint.
 */
export function getPresignS3Client(): S3Client {
  if (!presignClient) {
    presignClient = createClient(getObjectStorageConfig().publicEndpoint);
  }
  return presignClient;
}
