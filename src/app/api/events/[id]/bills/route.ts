import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { PDFDocument } from "pdf-lib";
import { Prisma } from "@/generated/prisma";
import type { Bill, IngestChannel } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";

interface WorkItem {
  filename: string;
  buffer: Buffer;
  contentType: string;
  contentHash: string;
}

interface DuplicateInfo {
  filename: string;
  existingFilename: string;
  existingCreatedAt: Date;
}

interface SplitInfo {
  originalFilename: string;
  pageCount: number;
}

interface FailureInfo {
  filename: string;
  error: string;
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const bills = await prisma.bill.findMany({
    where: { eventId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(bills);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: eventId } = await params;

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  const ingestChannel: IngestChannel =
    formData.get("ingestChannel") === "camera" ? "camera" : "upload";

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const splitInfo: SplitInfo[] = [];
  const failures: FailureInfo[] = [];
  const items: WorkItem[] = [];

  // Phase 1: flatten uploads into individual work items, splitting multi-page PDFs.
  // IMPORTANT: for split pages, the dedup hash is derived from the ORIGINAL file's
  // bytes + page number, NOT from the re-serialized split output. pdf-lib's .save()
  // is not guaranteed byte-identical across separate calls (e.g. embedded timestamps),
  // so hashing its output would make dedup unreliable for the same source re-uploaded.
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      items.push({
        filename: file.name,
        buffer,
        contentType: file.type || "application/octet-stream",
        contentHash: sha256(buffer),
      });
      continue;
    }

    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(buffer);
    } catch {
      failures.push({ filename: file.name, error: "invalid_pdf" });
      continue;
    }

    const pageCount = pdfDoc.getPageCount();

    if (pageCount <= 1) {
      items.push({
        filename: file.name,
        buffer,
        contentType: "application/pdf",
        contentHash: sha256(buffer),
      });
      continue;
    }

    splitInfo.push({ originalFilename: file.name, pageCount });
    const baseName = file.name.replace(/\.pdf$/i, "");
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
          createdByUserId: user.id,
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

  return NextResponse.json({ created, duplicates, splitInfo, failures }, { status: 201 });
}
