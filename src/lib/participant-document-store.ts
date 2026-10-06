import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";
import { uploadContentType, UPLOAD_MAX_BYTES } from "@/lib/portal-rules";

/** An uploaded file with the portal upload's limits (PDF / JPG / PNG by content, max 15 MB); null = refused. */
export async function readUploadedFile(file: FormDataEntryValue | null | undefined) {
  if (!(file instanceof File) || file.size > UPLOAD_MAX_BYTES) return null;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = uploadContentType(buffer);
  return contentType ? { buffer, contentType, filename: (file.name || "dokument").slice(0, 120) } : null;
}

/**
 * Stores a received file of a participant under the same path convention as
 * everything else (events/{eventId}/mail/documents/{participantId}/{hash}-{name}).
 * Used by the portal upload and the admin "Nahrát soubor" (slice 6 #3).
 */
export async function storeParticipantFile(eventId: string, participantId: string, buffer: Buffer, filename: string, contentType: string) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const gcsPath = `events/${eventId}/mail/documents/${participantId}/${hash}-${sanitizeFilename(filename)}`;
  await billsBucket.file(gcsPath).save(buffer, { contentType });
  return { gcsPath, contentHash: hash, originalFilename: filename };
}

// Persists a system-generated document (the registration-document merge on
// acceptance send, see src/lib/document-merge.ts) the same way a
// guardian-received one is stored -- same GCS path convention
// (events/{eventId}/mail/documents/{participantId}/...), same
// ParticipantDocument row. That's deliberate: the existing Drive sync
// button (src/lib/mail-drive-sync.ts) already mirrors any row with a
// gcsPath and no driveFileId yet into the participant's Drive subfolder --
// reusing the row means a generated document gets synced there too,
// without a second sync path to build or a second button to click.
//
// One row per participant+document-type, not one per send: a later
// resend/regeneration replaces the file in place (new gcsPath, driveFileId
// cleared so the next sync re-uploads it) rather than accumulating
// duplicate rows. The previously-synced Drive file, if any, is left in
// place rather than deleted -- ponytail: stale Drive copy on
// regeneration, worth cleaning up if this turns out to matter in practice.
export async function saveGeneratedParticipantDocument(opts: {
  eventId: string;
  participantId: string;
  eventListItemId: string;
  buffer: Buffer;
  filename: string;
  generatedByUserId: string;
}): Promise<{ id: string; previousDriveFileId: string | null }> {
  const hash = crypto.createHash("sha256").update(opts.buffer).digest("hex").slice(0, 16);
  const gcsPath = `events/${opts.eventId}/mail/documents/${opts.participantId}/${hash}-${sanitizeFilename(opts.filename)}`;
  await billsBucket.file(gcsPath).save(opts.buffer, { contentType: "application/pdf" });

  // Only ever the *generated* row: a document a guardian returned (email/
  // manual) is a separate row and must survive a regeneration untouched.
  const existing = await prisma.participantDocument.findFirst({
    where: { participantId: opts.participantId, eventListItemId: opts.eventListItemId, receivedVia: "generated" },
  });
  const data = {
    gcsPath,
    contentHash: hash,
    originalFilename: opts.filename,
    receivedVia: "generated" as const,
    receivedByUserId: opts.generatedByUserId,
    receivedAt: new Date(),
    driveFileId: null,
    driveSyncedAt: null,
  };
  if (existing) {
    await prisma.participantDocument.update({ where: { id: existing.id }, data });
    return { id: existing.id, previousDriveFileId: existing.driveFileId };
  }
  const created = await prisma.participantDocument.create({
    data: { participantId: opts.participantId, eventListItemId: opts.eventListItemId, ...data },
  });
  return { id: created.id, previousDriveFileId: null };
}
