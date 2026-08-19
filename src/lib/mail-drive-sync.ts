import path from "path";
import { prisma } from "@/lib/prisma";
import { billsBucket } from "@/lib/gcs";
import { getOrCreateSubfolder, uploadFileToFolder } from "@/lib/drive";
import { documentDisplayName } from "@/lib/mail-reply-template";

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".heic": "image/heic",
};

// One-way mirror of received documents into the event's Drive export
// folder: root folder -> per-participant subfolder, named
// {ParticipantName}_{DocumentTypeSuffix}{ext} -- the old app's exact
// folder organization (see docs/mail-helper-module-design.md
// "Infrastructure"). Only rows with a saved file (gcsPath set) have
// anything to mirror -- flag-only confirmations never had a file.
export async function syncParticipantDocumentsToDrive(eventId: string): Promise<{ synced: number; skipped: number }> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event?.driveExportFolderId) return { synced: 0, skipped: 0 };

  const pending = await prisma.participantDocument.findMany({
    where: { participant: { eventId }, driveFileId: null, gcsPath: { not: null } },
    include: { participant: true, eventListItem: true },
  });

  let synced = 0;
  let skipped = 0;

  for (const doc of pending) {
    if (!doc.gcsPath) {
      skipped++;
      continue;
    }
    try {
      const [buffer] = await billsBucket.file(doc.gcsPath).download();
      const participantFolderId = await getOrCreateSubfolder(event.driveExportFolderId, doc.participant.name);

      const suffix = (doc.eventListItem.data as { filenameSuffix?: string } | null)?.filenameSuffix
        || documentDisplayName({ id: doc.eventListItem.id, key: doc.eventListItem.key, name: doc.eventListItem.name, data: doc.eventListItem.data as { displayName?: string } | null });
      const ext = doc.originalFilename ? path.extname(doc.originalFilename) : "";
      const name = `${doc.participant.name}_${suffix}${ext}`;
      const mimeType = MIME_BY_EXT[ext.toLowerCase()] || "application/octet-stream";

      const driveFileId = await uploadFileToFolder(participantFolderId, name, buffer, mimeType);

      await prisma.participantDocument.update({
        where: { id: doc.id },
        data: { driveFileId, driveSyncedAt: new Date() },
      });
      synced++;
    } catch (err) {
      console.error(`[mail-drive-sync] failed for document ${doc.id}:`, err);
      skipped++;
    }
  }

  return { synced, skipped };
}
