import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";

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
}): Promise<void> {
  const hash = crypto.createHash("sha256").update(opts.buffer).digest("hex").slice(0, 16);
  const gcsPath = `events/${opts.eventId}/mail/documents/${opts.participantId}/${hash}-${sanitizeFilename(opts.filename)}`;
  await billsBucket.file(gcsPath).save(opts.buffer, { contentType: "application/pdf" });

  const existing = await prisma.participantDocument.findFirst({
    where: { participantId: opts.participantId, eventListItemId: opts.eventListItemId },
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
  } else {
    await prisma.participantDocument.create({
      data: { participantId: opts.participantId, eventListItemId: opts.eventListItemId, ...data },
    });
  }
}
