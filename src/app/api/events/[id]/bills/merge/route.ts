import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";
import { baseFilename, pagesEditBlock } from "@/lib/bill-pages";

// Joins several PDF bills (typically parts of one document split apart, see
// bills/[id]/split) back into one bill, in the order given. Import page and the
// bill list's bulk bar. The merged bill starts as "new" (reprocess = the caller
// should run the AI again). The originals are deleted -- same cleanup as the single-bill DELETE.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;

  const { billIds } = (await req.json()) as { billIds: string[] };
  const ids = [...new Set(billIds ?? [])];
  if (ids.length < 2) return NextResponse.json({ error: "need_two_bills" }, { status: 400 });

  const found = await prisma.bill.findMany({
    where: { id: { in: ids }, eventId },
    include: { event: { select: { status: true } }, bankMatches: { where: { confirmedAt: { not: null } }, select: { id: true } } },
  });
  const byId = new Map(found.map((b) => [b.id, b]));
  const bills = ids.map((id) => byId.get(id));
  if (bills.some((b) => !b)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ordered = bills as NonNullable<(typeof bills)[number]>[];
  for (const b of ordered) {
    const blocked = pagesEditBlock(b, { eventClosed: b.event.status === "closed", bankPaired: b.bankMatches.length > 0 });
    if (blocked) return NextResponse.json({ error: blocked, filename: b.originalFilename }, { status: 409 });
  }

  const merged = await PDFDocument.create();
  for (const bill of ordered) {
    const [buffer] = await billsBucket.file(bill.gcsObjectPath!).download();
    const src = await PDFDocument.load(buffer).catch(() => null);
    if (!src) return NextResponse.json({ error: "not_pdf", filename: bill.originalFilename }, { status: 400 });
    for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page);
  }
  const buffer = Buffer.from(await merged.save());
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");

  if (await prisma.bill.findFirst({ where: { eventId, contentHash } })) {
    return NextResponse.json({ error: "duplicate" }, { status: 409 });
  }

  const first = ordered[0];
  const filename = baseFilename(first.originalFilename) + " (sloučeno).pdf";
  const newId = crypto.randomUUID();
  const gcsObjectPath = `events/${eventId}/bills/${newId}-${sanitizeFilename(filename)}`;
  await billsBucket.file(gcsObjectPath).save(buffer, { contentType: "application/pdf" });

  const created = await prisma.$transaction(async (tx) => {
    const bill = await tx.bill.create({
      data: {
        id: newId,
        eventId,
        gcsObjectPath,
        sizeBytes: BigInt(buffer.length),
        originalFilename: filename,
        contentHash,
        ingestChannel: first.ingestChannel,
        driveSourceFileId: ordered.find((b) => b.driveSourceFileId)?.driveSourceFileId ?? null,
        payerAuthorId: first.payerAuthorId,
        pendingCategoryId: first.pendingCategoryId,
        createdByUserId: user.id,
      },
    });
    await tx.billCategory.deleteMany({ where: { billId: { in: ids } } });
    await tx.billAuditLog.deleteMany({ where: { billId: { in: ids } } });
    await tx.bill.deleteMany({ where: { id: { in: ids } } });
    return bill;
  });

  await Promise.all(ordered.map((b) => billsBucket.file(b.gcsObjectPath!).delete().catch(() => {})));

  return NextResponse.json({
    id: created.id,
    originalFilename: created.originalFilename,
    payerAuthorId: created.payerAuthorId,
    reprocess: ordered.some((b) => b.status !== "new"),
  });
}
