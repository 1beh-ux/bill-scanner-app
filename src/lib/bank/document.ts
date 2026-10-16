// Banka: the document side of a bill created from a payment (docs/bank-reconciliation.md A8):
// attach a file (upload / Drive import folder) -> AI extraction, its pairing stays; "Najít doklad"
// candidates; replacing the placeholder with a bill found in another event.
import crypto from "crypto";
import { Prisma, type User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";
import { processBillWithAi } from "@/lib/process-bill-ai";
import { moveBillToEvent } from "@/lib/bill-move";
import { hasModuleAccess } from "@/lib/module-access";
import { downloadFileBuffer, listAuthorSubfolders, listFilesInSubfolder, isGoogleNativeFile } from "@/lib/drive";

const MIME_OK = /^(application\/pdf|image\/(jpeg|png|webp))$/;

/** Store a document on a bill without one and run AI on it. The bank pairing is kept. */
export async function attachDocument(o: { billId: string; buffer: Buffer; filename: string; contentType: string; userId: string; driveSourceFileId?: string }) {
  const bill = await prisma.bill.findUnique({ where: { id: o.billId }, select: { id: true, eventId: true, gcsObjectPath: true, status: true } });
  if (!bill) return { error: "not_found" as const };
  if (bill.gcsObjectPath) return { error: "has_file" as const };
  if (bill.status === "approved") return { error: "bill_approved_locked" as const };
  if (!MIME_OK.test(o.contentType)) return { error: "bad_type" as const };
  const contentHash = crypto.createHash("sha256").update(o.buffer).digest("hex");
  if (await prisma.bill.findFirst({ where: { eventId: bill.eventId, contentHash }, select: { id: true } })) return { error: "duplicate" as const };
  const path = `events/${bill.eventId}/bills/${bill.id}-${sanitizeFilename(o.filename)}`;
  await billsBucket.file(path).save(o.buffer, { contentType: o.contentType });
  try {
    await prisma.bill.update({
      where: { id: bill.id },
      data: { gcsObjectPath: path, originalFilename: o.filename, contentHash, sizeBytes: BigInt(o.buffer.length), documentMissing: false, documentFromStatement: false, ...(o.driveSourceFileId && { driveSourceFileId: o.driveSourceFileId }) },
    });
  } catch (err) {
    await billsBucket.file(path).delete().catch(() => {});
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { error: "duplicate" as const };
    throw err;
  }
  const ai = await processBillWithAi(bill.id, { userId: o.userId });
  return { ok: true as const, ai: ai.ok ? ai.status : ai.error };
}

/** "Najít doklad": same-amount bills (±7 days) in other events the user has Účtenky in, and Drive import files not imported yet. */
export async function findDocument(billId: string, user: User) {
  const bill = await prisma.bill.findUniqueOrThrow({ where: { id: billId }, include: { event: { select: { organizationId: true, driveIngestFolderId: true } } } });
  const events = await prisma.event.findMany({ where: { organizationId: bill.event.organizationId, id: { not: bill.eventId }, status: "active" }, select: { id: true, name: true } });
  const allowed: { id: string; name: string }[] = [];
  for (const e of events) if (await hasModuleAccess(user, e.id, "bills")) allowed.push(e);
  const day = 864e5;
  const otherBills = bill.amountCzk && bill.billDate
    ? (
        await prisma.bill.findMany({
          where: { eventId: { in: allowed.map((e) => e.id) }, amountCzk: bill.amountCzk, billDate: { gte: new Date(bill.billDate.getTime() - 7 * day), lte: new Date(bill.billDate.getTime() + 7 * day) }, status: { notIn: ["approved", "queued", "processing"] }, gcsObjectPath: { not: null } },
          select: { id: true, eventId: true, merchantName: true, billDate: true, amountCzk: true, originalFilename: true },
          take: 20,
        })
      ).map((b) => ({ ...b, amountCzk: Number(b.amountCzk), eventName: allowed.find((e) => e.id === b.eventId)?.name ?? "" }))
    : [];

  let driveFiles: { id: string; name: string; folder: string }[] = [];
  let driveError: string | null = null;
  if (bill.event.driveIngestFolderId) {
    try {
      const root = bill.event.driveIngestFolderId;
      const folders = [{ id: root, name: "" }, ...(await listAuthorSubfolders(bill.eventId, root, "ingest"))];
      const files = (await Promise.all(folders.map(async (f) => (await listFilesInSubfolder(bill.eventId, f.id, "ingest")).map((x) => ({ ...x, folder: f.name }))))).flat().filter((x) => !isGoogleNativeFile(x.mimeType));
      const imported = new Set((await prisma.bill.findMany({ where: { eventId: bill.eventId, driveSourceFileId: { in: files.map((x) => x.id) } }, select: { driveSourceFileId: true } })).map((b) => b.driveSourceFileId));
      driveFiles = files.filter((x) => !imported.has(x.id)).map((x) => ({ id: x.id, name: x.name, folder: x.folder })).slice(0, 100);
    } catch {
      driveError = "drive_unavailable";
    }
  }
  return { otherBills, driveFiles, driveError, hasDriveFolder: !!bill.event.driveIngestFolderId };
}

/** A Drive import file onto the placeholder. */
export async function attachDriveFile(o: { billId: string; fileId: string; name: string; userId: string }) {
  const bill = await prisma.bill.findUniqueOrThrow({ where: { id: o.billId }, select: { eventId: true } });
  const buffer = await downloadFileBuffer(bill.eventId, o.fileId);
  const ext = o.name.toLowerCase().split(".").pop();
  const contentType = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return attachDocument({ billId: o.billId, buffer, filename: o.name, contentType, userId: o.userId, driveSourceFileId: o.fileId });
}

/** "Přesunout sem a nahradit": the found bill moves here, takes over the placeholder's pairings, the placeholder goes. */
export async function replaceWithBill(o: { placeholderId: string; foundBillId: string; user: User }) {
  const ph = await prisma.bill.findUniqueOrThrow({ where: { id: o.placeholderId }, select: { id: true, eventId: true, gcsObjectPath: true, status: true } });
  if (ph.gcsObjectPath) return { error: "has_file" as const };
  if (ph.status === "approved") return { error: "bill_approved_locked" as const };
  const moved = await moveBillToEvent(o.foundBillId, ph.eventId, o.user);
  if (!moved.ok) return { error: moved.error };
  await prisma.$transaction(async (db) => {
    await db.bankMatch.updateMany({ where: { billId: ph.id }, data: { billId: o.foundBillId } });
    await db.billCategory.deleteMany({ where: { billId: ph.id } });
    await db.billAuditLog.deleteMany({ where: { billId: ph.id } });
    await db.bill.delete({ where: { id: ph.id } });
    await db.billAuditLog.create({ data: { billId: o.foundBillId, userId: o.user.id, actionType: "bank_replace", fieldName: "bank", oldValue: ph.id } });
  });
  return { ok: true as const, billId: o.foundBillId };
}
