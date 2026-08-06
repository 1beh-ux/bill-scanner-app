import type { Author } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  listAuthorSubfolders,
  listFilesInSubfolder,
  downloadFileBuffer,
  isGoogleNativeFile,
} from "@/lib/drive";
import { ingestBillFiles, type RawFileInput, type IngestResult } from "@/lib/bill-ingest";

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
  skippedNativeGoogleFiles: { filename: string; subfolderName: string }[];
  ingest: IngestResult;
}

/**
 * Matches a Drive subfolder name to an existing active author (trimmed,
 * case-insensitive) or creates a new one. Case-insensitive matching is
 * deliberate here even though the rest of the app does exact-match author
 * creation — folder names are typed by hand in Drive and trivial casing
 * differences shouldn't spawn duplicate author records.
 */
async function findOrCreateAuthorForSubfolder(
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

async function ensureAuthorEventAccess(authorId: string, eventId: string): Promise<void> {
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

  const subfolders = await listAuthorSubfolders(event.driveIngestFolderId);

  const authorsResolved: AuthorResolution[] = [];
  const skippedNativeGoogleFiles: { filename: string; subfolderName: string }[] = [];
  const candidateFileIds: string[] = [];
const fileMeta = new Map<string, { subfolderName: string; authorId: string; name: string; mimeType: string }>();

  for (const subfolder of subfolders) {
    const { author, created } = await findOrCreateAuthorForSubfolder(subfolder.name);
    await ensureAuthorEventAccess(author.id, eventId);
    authorsResolved.push({
      subfolderName: subfolder.name,
      authorId: author.id,
      authorName: author.canonicalName,
      created,
    });

    const files = await listFilesInSubfolder(subfolder.id);
    for (const file of files) {
      if (isGoogleNativeFile(file.mimeType)) {
        skippedNativeGoogleFiles.push({ filename: file.name, subfolderName: subfolder.name });
        continue;
      }
      candidateFileIds.push(file.id);
      fileMeta.set(file.id, {
        subfolderName: subfolder.name,
        authorId: author.id,
        name: file.name,
        mimeType: file.mimeType,
      });
    }
  }

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
  for (const fileId of toDownloadIds) {
    const meta = fileMeta.get(fileId)!;
    const buffer = await downloadFileBuffer(fileId);
    rawFiles.push({
      filename: meta.name,
      buffer,
      contentType: meta.mimeType,
      driveSourceFileId: fileId,
      payerAuthorId: meta.authorId,
    });
  }

  const ingest = await ingestBillFiles(eventId, userId, "drive", rawFiles);

  return {
    authorsResolved,
    skippedAlreadyImported: alreadyImportedIds.size,
    skippedNativeGoogleFiles,
    ingest,
  };
}