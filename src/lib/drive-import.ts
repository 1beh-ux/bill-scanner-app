import type { Author } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  listAuthorSubfolders,
  listFilesInSubfolder,
  downloadFileBuffer,
  isGoogleNativeFile,
} from "@/lib/drive";
import { ingestBillFiles, type RawFileInput, type IngestResult } from "@/lib/bill-ingest";
import { DriveError } from "@/lib/drive-errors";
import { getDriveIdentity } from "@/lib/drive";

export class DriveImportError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

interface AuthorResolution {
  subfolderName: string;
  authorId: string;
  authorName: string;
  created: boolean;
}

export interface ImportSummary {
  authorsResolved: AuthorResolution[];
  skippedAlreadyImported: number;
  /** Names of the files skipped because a previous import already brought them in. */
  skippedAlreadyImportedFiles: { filename: string; subfolderName: string }[];
  skippedNativeGoogleFiles: { filename: string; subfolderName: string }[];
  downloadFailures: { filename: string; error: string }[];
  ingest: IngestResult;
  /** The Google account used (and the service account), for messages about failed downloads. */
  identityEmail: string;
  serviceAccountEmail: string;
}
/**
 * Matches a Drive subfolder name to an existing active author (trimmed,
 * case-insensitive) or creates a new one. Case-insensitive matching is
 * deliberate here even though the rest of the app does exact-match author
 * creation — folder names are typed by hand in Drive and trivial casing
 * differences shouldn't spawn duplicate author records.
 */
export async function findOrCreateAuthorForSubfolder(
  name: string
): Promise<{ author: Author; created: boolean }> {
  const trimmed = name.trim();

  const existing = await prisma.author.findFirst({
    where: {
      active: true,
      canonicalName: { equals: trimmed, mode: "insensitive" },
    },
  });
  if (existing) return { author: existing, created: false };

  const author = await prisma.author.create({
    data: { canonicalName: trimmed },
  });
  return { author, created: true };
}

export async function ensureAuthorEventAccess(authorId: string, eventId: string): Promise<void> {
  const existing = await prisma.authorEventAccess.findUnique({
    where: { authorId_eventId: { authorId, eventId } },
  });
  if (!existing) {
    await prisma.authorEventAccess.create({ data: { authorId, eventId } });
  }
}

export async function importBillsFromDrive(
  eventId: string,
  userId: string
): Promise<ImportSummary> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new DriveImportError("event_not_found");
  if (event.status === "closed") throw new DriveImportError("event_closed_locked");
  if (!event.driveIngestFolderId) throw new DriveImportError("no_ingest_folder");

  const subfolders = await listAuthorSubfolders(eventId, event.driveIngestFolderId, "ingest");

  const authorsResolved: AuthorResolution[] = [];
  const skippedNativeGoogleFiles: { filename: string; subfolderName: string }[] = [];
  const candidateFileIds: string[] = [];
  const fileMeta = new Map<string, { authorId: string | null; name: string; mimeType: string; subfolderName: string }>();

  function collect(files: Awaited<ReturnType<typeof listFilesInSubfolder>>, subfolderName: string, authorId: string | null) {
    for (const file of files) {
      if (isGoogleNativeFile(file.mimeType)) {
        skippedNativeGoogleFiles.push({ filename: file.name, subfolderName });
        continue;
      }
      candidateFileIds.push(file.id);
      fileMeta.set(file.id, { authorId, name: file.name, mimeType: file.mimeType, subfolderName });
    }
  }

  for (const subfolder of subfolders) {
    const { author, created } = await findOrCreateAuthorForSubfolder(subfolder.name);
    await ensureAuthorEventAccess(author.id, eventId);
    authorsResolved.push({
      subfolderName: subfolder.name,
      authorId: author.id,
      authorName: author.canonicalName,
      created,
    });

    collect(await listFilesInSubfolder(eventId, subfolder.id, "ingest"), subfolder.name, author.id);
  }

  // Files directly in the ingest folder have no author subfolder -- imported
  // as event-paid bills (no payer), same as a plain upload.
  collect(await listFilesInSubfolder(eventId, event.driveIngestFolderId, "ingest"), "", null);

  // Skip files already brought in by a previous import run, without downloading
  // them again — this is what driveSourceFileId was reserved for.
  const alreadyImported = candidateFileIds.length
    ? await prisma.bill.findMany({
        where: { eventId, driveSourceFileId: { in: candidateFileIds } },
        select: { driveSourceFileId: true },
      })
    : [];
  const alreadyImportedIds = new Set(alreadyImported.map((b) => b.driveSourceFileId));
  const toDownloadIds = candidateFileIds.filter((fid) => !alreadyImportedIds.has(fid));

  const rawFiles: RawFileInput[] = [];
  const downloadFailures: { filename: string; error: string }[] = [];

  for (const fileId of toDownloadIds) {
    const meta = fileMeta.get(fileId)!;
    try {
      const buffer = await downloadFileBuffer(eventId, fileId);
      rawFiles.push({
        filename: meta.name,
        buffer,
        contentType: meta.mimeType,
        driveSourceFileId: fileId,
        payerAuthorId: meta.authorId ?? undefined,
      });
    } catch (err) {
      // One file's download exhausting all retries no longer aborts every
      // other file in the batch — it's reported and the rest continue.
      // `error` is a stable DriveErrorCode (rendered as driveSettings.error.<code>).
      downloadFailures.push({ filename: meta.name, error: err instanceof DriveError ? err.code : "drive_unknown" });
    }
  }

  const ingest = await ingestBillFiles(eventId, userId, "drive", rawFiles);
  const identity = await getDriveIdentity(eventId);

  return {
    authorsResolved,
    skippedAlreadyImported: alreadyImportedIds.size,
    skippedAlreadyImportedFiles: [...alreadyImportedIds]
      .map((fid) => fileMeta.get(fid!))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({ filename: m.name, subfolderName: m.subfolderName })),
    skippedNativeGoogleFiles,
    downloadFailures,
    ingest,
    identityEmail: identity.email,
    serviceAccountEmail: identity.serviceAccountEmail,
  };
}