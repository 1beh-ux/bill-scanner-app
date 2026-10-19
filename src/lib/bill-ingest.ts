import crypto from "crypto";
import { PDFDocument } from "pdf-lib";
import { Prisma } from "@/generated/prisma";
import type { Bill, IngestChannel } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";
import { analyseBlankPages } from "@/lib/pdf-blank";

export interface RawFileInput {
  filename: string;
  buffer: Buffer;
  contentType: string;
  /** Set for Drive-sourced files; propagated onto every bill (including split
   * pages) created from this file, so a later import can detect it was already
   * brought in without re-downloading or re-hashing it. */
  driveSourceFileId?: string;
  /** Set for Drive-sourced files when the source subfolder maps to a known
   * author. Propagated onto every bill (including split pages) created from
   * this file. Not used by direct upload/camera capture. */
  payerAuthorId?: string;
}

interface WorkItem {
  filename: string;
  buffer: Buffer;
  contentType: string;
  contentHash: string;
  driveSourceFileId?: string;
  payerAuthorId?: string;
  /** Multi-page PDF: its page count and the 0-based pages that look blank. */
  pages?: { count: number; blank: number[] };
  /** Legacy hashes this file's pages got when ingest still split every page (dedup). */
  legacyHashes?: string[];
}

export interface DuplicateInfo {
  filename: string;
  existingFilename: string;
  existingCreatedAt: Date;
}

/** A multi-page PDF kept as one bill; the import page offers to split it (bill-pages.ts). */
export interface MultiPageInfo {
  billId: string;
  pageCount: number;
  /** 0-based pages that look blank (pdf-blank.ts) -- pre-removed in the split editor. */
  blankPages: number[];
}

export interface FailureInfo {
  filename: string;
  error: string;
}

export interface IngestResult {
  created: Bill[];
  duplicates: DuplicateInfo[];
  multiPage: MultiPageInfo[];
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
 * Shared ingest pipeline: dedupes (within-batch, then
 * against the DB), uploads to GCS, and creates Bill rows. Used by direct
 * upload/camera capture AND Drive import — extend here, don't duplicate.
 */
export async function ingestBillFiles(
  eventId: string,
  userId: string,
  ingestChannel: IngestChannel,
  rawFiles: RawFileInput[],
  // false: don't even look at the pages (the table import -- one row = one file =
  // one bill in the source data). Uploads and Drive-folder import report multi-page
  // PDFs so the import page can offer to split them -- nothing is split here any more.
  options: { splitPdfs?: boolean } = {}
): Promise<IngestResult> {
  const multiPage: MultiPageInfo[] = [];
  const failures: FailureInfo[] = [];
  const items: WorkItem[] = [];

  for (const file of rawFiles) {
    const buffer = file.buffer;
    const isPdf = file.contentType === "application/pdf" || file.filename.toLowerCase().endsWith(".pdf");

    if (!isPdf || options.splitPdfs === false) {
      items.push({
        filename: file.filename,
        buffer,
        contentType: isPdf ? "application/pdf" : file.contentType || "application/octet-stream",
        contentHash: sha256(buffer),
        driveSourceFileId: file.driveSourceFileId,
        payerAuthorId: file.payerAuthorId,
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
        payerAuthorId: file.payerAuthorId,
      });
      continue;
    }

    const sourceHash = sha256(buffer);
    const verdicts = await analyseBlankPages(buffer);
    items.push({
      filename: file.filename,
      buffer,
      contentType: "application/pdf",
      contentHash: sourceHash,
      driveSourceFileId: file.driveSourceFileId,
      payerAuthorId: file.payerAuthorId,
      pages: { count: pageCount, blank: verdicts.flatMap((v, i) => (v.blank ? [i] : [])) },
      legacyHashes: Array.from({ length: pageCount }, (_, i) => sha256(`${sourceHash}:page:${i + 1}`)),
    });
  }

  const created: Bill[] = [];
  const duplicates: DuplicateInfo[] = [];

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

  const checkResults = await processInBatches(toCheck, UPLOAD_CONCURRENCY, async (item) => {
    // Also the bills this file was split into (split route: "<hash>:<pages>"; old ingest: per-page hashes).
    const existing = await prisma.bill.findFirst({
      where: {
        eventId,
        OR: [
          { contentHash: item.contentHash },
          ...(item.pages ? [{ contentHash: { startsWith: `${item.contentHash}:` } }, { contentHash: { in: item.legacyHashes } }] : []),
        ],
      },
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
          sizeBytes: BigInt(item.buffer.length),
          originalFilename: item.filename,
          contentHash: item.contentHash,
          ingestChannel,
          driveSourceFileId: item.driveSourceFileId ?? null,
          payerAuthorId: item.payerAuthorId ?? null,
          createdByUserId: userId,
        },
      });
      created.push(bill);
      if (item.pages) multiPage.push({ billId, pageCount: item.pages.count, blankPages: item.pages.blank });
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

  return { created, duplicates, multiPage, failures };
}