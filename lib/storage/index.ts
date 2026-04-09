export {
  getObjectStorageConfig,
  isObjectStorageConfigured,
  type ObjectStorageConfig,
} from "@/lib/storage/config";
export { getPresignS3Client, getS3Client } from "@/lib/storage/s3-client";
export {
  buildObjectKey,
  deleteObject,
  ensureBucket,
  getPresignedGetUrl,
  getPresignedPutUrl,
  putObject,
  type UploadedObject,
} from "@/lib/storage/file-storage";
export {
  parseStoredImageReference,
  s3ObjectKeyFromStoredValue,
} from "@/lib/storage/storage-key";
