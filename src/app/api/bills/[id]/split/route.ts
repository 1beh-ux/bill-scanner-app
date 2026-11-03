import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";
import { baseFilename, isWholeFile, pagesEditBlock, pagesLabel, validGroups } from "@/lib/bill-pages";

// Splits one PDF bill into several by the page groups the import page's editor sends
// ({ groups: [[0, 1], [3]] } -- 0-based, in the new order; pages in no group are left out).
// One group = the same bill with pages removed / reordered. The original is deleted --
// the inverse of bills/merge, same cleanup as the single-bill DELETE.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const bill = await prisma.bill.findUnique({
    where: { id },
    include: { event: { select: { status: true } }, bankMatches: { where: { confirmedAt: { not: null } }, select: { id: true } } },
  });
  if (!bill) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const denied = await requireModuleAccess(user, bill.eventId, "bills");
  if (denied) return denied;
  if (bill.ingestChannel === "travel_order") return NextResponse.json({ error: "travel_order_locked" }, { status: 409 });
  const blocked = pagesEditBlock(bill, { eventClosed: bill.event.status === "closed", bankPaired: bill.bankMatches.length > 0 });
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const [buffer] = await billsBucket.file(bill.gcsObjectPath!).download();
  let src;
  try {
    src = await PDFDocument.load(buffer);
  } catch {
    return NextResponse.json({ error: "not_pdf" }, { status: 400 });
  }
  const pageCount = src.getPageCount();
  const { groups } = (await req.json().catch(() => ({}))) as { groups?: unknown };
  if (!validGroups(groups, pageCount)) return NextResponse.json({ error: "bad_groups" }, { status: 400 });
  if (isWholeFile(groups, pageCount)) return NextResponse.json({ created: [{ id: bill.id, originalFilename: bill.originalFilename, pageCount }] });

  // Hash "<original hash>:<pages>": re-importing the original file is still recognised (bill-ingest.ts).
  const base = baseFilename(bill.originalFilename);
  const parts = await Promise.all(
    groups.map(async (pages) => {
      const doc = await PDFDocument.create();
      for (const page of await doc.copyPages(src, pages)) doc.addPage(page);
      const bytes = Buffer.from(await doc.save());
      const newId = crypto.randomUUID();
      const originalFilename = `${base} (${pagesLabel(pages, pageCount)}).pdf`;
      const gcsObjectPath = `events/${bill.eventId}/bills/${newId}-${sanitizeFilename(originalFilename)}`;
      await billsBucket.file(gcsObjectPath).save(bytes, { contentType: "application/pdf" });
      return { id: newId, originalFilename, gcsObjectPath, sizeBytes: BigInt(bytes.length), contentHash: `${bill.contentHash}:${pages.join(",")}`, pageCount: pages.length };
    })
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.billCategory.deleteMany({ where: { billId: id } });
      await tx.billAuditLog.deleteMany({ where: { billId: id } });
      await tx.bill.delete({ where: { id } });
      await tx.bill.createMany({
        data: parts.map((p) => ({
          id: p.id,
          originalFilename: p.originalFilename,
          gcsObjectPath: p.gcsObjectPath,
          sizeBytes: p.sizeBytes,
          contentHash: p.contentHash,
          eventId: bill.eventId,
          ingestChannel: bill.ingestChannel,
          driveSourceFileId: bill.driveSourceFileId,
          payerAuthorId: bill.payerAuthorId,
          pendingCategoryId: bill.pendingCategoryId,
          createdByUserId: user.id,
        })),
      });
    });
  } catch (err) {
    await Promise.all(parts.map((p) => billsBucket.file(p.gcsObjectPath).delete().catch(() => {})));
    throw err;
  }
  await billsBucket.file(bill.gcsObjectPath!).delete().catch(() => {});

  return NextResponse.json({
    created: parts.map((p) => ({ id: p.id, originalFilename: p.originalFilename, pageCount: p.pageCount })),
    reprocess: bill.status !== "new",
  });
}
