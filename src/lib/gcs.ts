import { Storage } from "@google-cloud/storage";

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || "bill-scanner-v2-files";

const storage = new Storage();

export const billsBucket = storage.bucket(BUCKET_NAME);

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}
