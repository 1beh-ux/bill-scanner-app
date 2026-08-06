import crypto from "crypto";
import { PDFDocument } from "pdf-lib";
import { Prisma } from "@/generated/prisma";
import type { Bill, IngestChannel } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";

export interface RawFileInput {
  filename: string;
  buffer: Buffer;
  contentType: string;
  /** Set for Drive-sourced files; propagated onto every bill (including split
   * pages) created from this file, so a later import can detect it was already
   * brought in without re-downloading or re-hashing it. */
  driveSourceFileId?: string;
}

interface WorkItem {
  filename: string;
  buffer: Buffer;
  contentType: string;
  contentHash: string;
  driveSourceFileId?: string;
}

export interface DuplicateInfo {
  filename: string;
  existingFilename: string;
  existingCreatedAt: Date;
}

export interface SplitInfo {
  originalFilename: string;
  pageCount: number;
}

export interface FailureInfo {
  filename: string;
  error: string;
}

export interface IngestResult {
  created: Bill[];
  duplicates: DuplicateInfo[];
  splitInfo: SplitInfo[];
  failures: FailureInfo[];
}

const UPLOAD_CONCURRENCY = 5;

function sha256(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(worker));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Shared ingest pipeline: splits multi-page PDFs, dedupes (within-batch, then
 * against the DB), uploads to GCS, and creates Bill rows. Used by direct
 * upload/camera capture AND Drive import — extend here, don't duplicate.
 */
export async function ingestBillFiles(
  eventId: string,
  userId: string,
  ingestChannel: IngestChannel,
  rawFiles: RawFileInput[]
): Promise<IngestResult> {
  const splitInfo: SplitInfo[] = [];
  const failures: FailureInfo[] = [];
  const items: WorkItem[] = [];

  // Phase 1: flatten uploads into individual work items, splitting multi-page PDFs.
  // IMPORTANT: for split pages, the dedup hash is derived from the ORIGINAL file's
  // bytes + page number, NOT from the re-serialized split output. pdf-lib's .save()
  // is not guaranteed byte-identical across separate calls (e.g. embedded timestamps),
  // so hashing its output would make dedup unreliable for the same source re-uploaded.
  for (const file of rawFiles) {
    const buffer = file.buffer;
    const isPdf = file.contentType === "application/pdf" || file.filename.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      items.push({
        filename: file.filename,
        buffer,
        contentType: file.contentType || "application/octet-stream",
        contentHash: sha256(buffer),
        driveSourceFileId: file.driveSourceFileId,
      });
      continue;
    }

    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(buffer);
    } catch {
      failures.push({ filename: file.filename, error: "invalid_pdf" });
      continue;
    }

    const pageCount = pdfDoc.getPageCount();

    if (pageCount <= 1) {
      items.push({
        filename: file.filename,
        buffer,
        contentType: "application/pdf",
        contentHash: sha256(buffer),
        driveSourceFileId: file.driveSourceFileId,
      });
      continue;
    }

    splitInfo.push({ originalFilename: file.filename, pageCount });
    const baseName = file.filename.replace(/\.pdf$/i, "");
    const sourceHash = sha256(buffer);

    for (let i = 0; i < pageCount; i++) {
      const subDoc = await PDFDocument.create();
      const [copiedPage] = await subDoc.copyPages(pdfDoc, [i]);
      subDoc.addPage(copiedPage);
      const pageBytes = await subDoc.save();

      items.push({
        filename: `${baseName} (strana ${i + 1} z ${pageCount}).pdf`,
        buffer: Buffer.from(pageBytes),
        contentType: "application/pdf",
        contentHash: sha256(`${sourceHash}:page:${i + 1}`),
        driveSourceFileId: file.driveSourceFileId,
      });
    }
  }

  const created: Bill[] = [];
  const duplicates: DuplicateInfo[] = [];

  // Phase 2: dedupe within this same batch first — synchronous, so no race is possible.
  const seenInBatch = new Map<string, string>();
  const toCheck: WorkItem[] = [];

  for (const item of items) {
    const firstFilename = seenInBatch.get(item.contentHash);
    if (firstFilename) {
      duplicates.push({
        filename: item.filename,
        existingFilename: firstFilename,
        existingCreatedAt: new Date(),
      });
      continue;
    }
    seenInBatch.set(item.contentHash, item.filename);
    toCheck.push(item);
  }

  // Phase 3: check against bills already saved for this event — concurrently, since
  // these are cheap reads, not the expensive part.
  const checkResults = await processInBatches(toCheck, UPLOAD_CONCURRENCY, async (item) => {
    const existing = await prisma.bill.findFirst({
      where: { eventId, contentHash: item.contentHash },
    });
    return { item, existing };
  });

  const toUpload: WorkItem[] = [];
  for (const { item, existing } of checkResults) {
    if (existing) {
      duplicates.push({
        filename: item.filename,
        existingFilename: existing.originalFilename,
        existingCreatedAt: existing.createdAt,
      });
    } else {
      toUpload.push(item);
    }
  }

  // Phase 4: upload + create concurrently. The unique constraint on
  // (eventId, contentHash) is the real correctness guarantee here — if two
  // concurrent requests somehow race past the check above, the database itself
  // rejects the second insert, and we clean up the orphaned file it already wrote.
  await processInBatches(toUpload, UPLOAD_CONCURRENCY, async (item) => {
    const billId = crypto.randomUUID();
    const objectPath = `events/${eventId}/bills/${billId}-${sanitizeFilename(item.filename)}`;

    await billsBucket.file(objectPath).save(item.buffer, { contentType: item.contentType });

    try {
      const bill = await prisma.bill.create({
        data: {
          id: billId,
          eventId,
          gcsObjectPath: objectPath,
          originalFilename: item.filename,
          contentHash: item.contentHash,
          ingestChannel,
          driveSourceFileId: item.driveSourceFileId ?? null,
          createdByUserId: userId,
        },
      });
      created.push(bill);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        await billsBucket.file(objectPath).delete().catch(() => {});
        const existing = await prisma.bill.findFirst({
          where: { eventId, contentHash: item.contentHash },
        });
        duplicates.push({
          filename: item.filename,
          existingFilename: existing?.originalFilename || item.filename,
          existingCreatedAt: existing?.createdAt || new Date(),
        });
      } else {
        throw err;
      }
    }
  });

  return { created, duplicates, splitInfo, failures };
}