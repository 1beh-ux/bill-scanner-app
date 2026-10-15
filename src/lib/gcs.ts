import { Storage } from "@google-cloud/storage";

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || "bill-scanner-v2-files";

const storage = new Storage();
export const billsBucket = storage.bucket(BUCKET_NAME);

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}
/**
 * Stored bytes of these objects together (usage metering, AiUsage / sizeBytes); missing objects
 * count 0; null = none of them found. Used where the bytes aren't at hand and by
 * scripts/backfill-gcs-sizes.ts.
 */
export async function gcsSize(...paths: (string | null | undefined)[]): Promise<bigint | null> {
  let total: bigint | null = null;
  for (const p of paths) {
    if (!p) continue;
    const [meta] = await billsBucket.file(p).getMetadata().catch(() => [null]);
    if (meta?.size !== undefined) total = (total ?? BigInt(0)) + BigInt(meta.size);
  }
  return total;
}
