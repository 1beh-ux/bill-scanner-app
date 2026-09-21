import path from "path";
import { prisma } from "@/lib/prisma";
import { billsBucket } from "@/lib/gcs";
import { getOrCreateSubfolder, uploadFileToFolder, updateFileContent } from "@/lib/drive";
import { documentDisplayName } from "@/lib/mail-reply-template";

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".heic": "image/heic",
};

type EventFolders = { driveParticipantsFolderId: string | null; driveExportFolderId: string | null };

/** Where per-participant folders live: the participants folder, else the export folder. */
export function participantsRootFolderId(event: EventFolders): string | null {
  return event.driveParticipantsFolderId ?? event.driveExportFolderId ?? null;
}

/** {Participant}_{DocumentTypeSuffix} -- the Drive name (without extension) for a participant's document. */
export function documentFileBaseName(
  participantName: string,
  listItem: { id: string; key: string | null; name: string; data: unknown }
): string {
  const suffix = (listItem.data as { filenameSuffix?: string } | null)?.filenameSuffix
    || documentDisplayName({ id: listItem.id, key: listItem.key, name: listItem.name, data: listItem.data as { displayName?: string } | null });
  return `${participantName}_${suffix}`;
}

// Uploads one stored document into {root}/{participant name}/ and records the
// Drive file id. Shared by the sync button (received documents, retries) and
// the acceptance send / regenerate (generated documents go out right after
// they're saved). `replaceFileId` overwrites that Drive file in place instead
// of adding a second copy (a regenerated PDF); if that fails it falls back to
// uploading a new file.
export async function syncParticipantDocumentToDrive(
  documentId: string,
  rootFolderId: string,
  opts: { replaceFileId?: string | null } = {}
): Promise<void> {
  const doc = await prisma.participantDocument.findUniqueOrThrow({
    where: { id: documentId },
    include: { participant: true, eventListItem: true },
  });
  if (!doc.gcsPath) return;

  const [buffer] = await billsBucket.file(doc.gcsPath).download();
  const ext = doc.originalFilename ? path.extname(doc.originalFilename) : "";
  // A guardian-returned file gets "_prijato" so it can't be mistaken for (or
  // collide with) the blank document we generated under the same base name.
  const receivedMarker = doc.receivedVia === "generated" ? "" : "_prijato";
  const name = `${documentFileBaseName(doc.participant.name, doc.eventListItem)}${receivedMarker}${ext}`;
  const mimeType = MIME_BY_EXT[ext.toLowerCase()] || "application/octet-stream";

  let driveFileId: string | null = null;
  if (opts.replaceFileId) {
    try {
      await updateFileContent(doc.participant.eventId, opts.replaceFileId, buffer, mimeType);
      driveFileId = opts.replaceFileId;
    } catch (err) {
      console.log(`[mail-drive-sync] couldn't update ${opts.replaceFileId} in place, uploading a new copy:`, String(err));
    }
  }
  if (!driveFileId) {
    const participantFolderId = await getOrCreateSubfolder(doc.participant.eventId, rootFolderId, doc.participant.name, "participants");
    driveFileId = await uploadFileToFolder(doc.participant.eventId, participantFolderId, name, buffer, mimeType, "participants");
  }
  await prisma.participantDocument.update({
    where: { id: doc.id },
    data: { driveFileId, driveSyncedAt: new Date() },
  });
}

// One-way mirror of stored documents into the participants folder: root
// folder -> per-participant subfolder, named {ParticipantName}_{DocumentTypeSuffix}{ext}
// -- the old app's exact folder organization (see docs/mail-helper-module-design.md
// "Infrastructure"). Only rows with a saved file (gcsPath set) have anything
// to mirror -- flag-only confirmations never had a file.
export async function syncParticipantDocumentsToDrive(eventId: string): Promise<{ synced: number; skipped: number }> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  const rootFolderId = event ? participantsRootFolderId(event) : null;
  if (!rootFolderId) return { synced: 0, skipped: 0 };

  const pending = await prisma.participantDocument.findMany({
    where: { participant: { eventId }, driveFileId: null, gcsPath: { not: null } },
    select: { id: true },
  });

  let synced = 0;
  let skipped = 0;
  for (const doc of pending) {
    try {
      await syncParticipantDocumentToDrive(doc.id, rootFolderId);
      synced++;
    } catch (err) {
      console.error(`[mail-drive-sync] failed for document ${doc.id}:`, err);
      skipped++;
    }
  }
  return { synced, skipped };
}
