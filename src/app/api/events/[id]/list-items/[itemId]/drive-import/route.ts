import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { downloadFileBuffer, exportFileAsPdf, getDriveFileMeta, getDriveIdentity, isGoogleNativeFile, isPdfExportable, listFilesInSubfolder } from "@/lib/drive";
import { DriveError, httpStatusForDriveError, parseFolderId } from "@/lib/drive-errors";
import { matchPeople } from "@/lib/doc-import-match";
import { readUploadedFile } from "@/lib/participant-document-store";
import { permanentDocKeys, savePersonDocument } from "@/lib/person-documents";
import { UPLOAD_MAX_BYTES } from "@/lib/portal-rules";

// "Importovat z Drive" (docs/registration-slice7-spec.md), admin only: signed
// forms of a "platí trvale" document type from one Drive folder into the
// people's profiles. The event is only the Drive context (its Google identity);
// the files go to the person store, never to the event.
// GET ?folder=<link or id>: preview -- every file directly in the folder with
// its suggested people (matched by name against everyone in Lidé).
// POST { items: [{ fileId, childId, force? }] } (max 10, the client batches):
// each file becomes the person's current document, like the person-page upload.
const BATCH = 10;
const FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

async function load(params: Promise<{ id: string; itemId: string }>) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (user.role !== "admin") return { error: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  const { id: eventId, itemId } = await params;
  const item = await prisma.eventListItem.findUnique({ where: { id: itemId } });
  if (!item || item.eventId !== eventId || item.kind !== "document" || !item.key || !(await permanentDocKeys()).has(item.key)) {
    return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }
  return { user, eventId, key: item.key };
}

function driveErrorResponse(err: unknown) {
  if (err instanceof DriveError) return NextResponse.json({ error: err.code, ...err.params }, { status: httpStatusForDriveError(err.code) });
  throw err;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { error, eventId, key } = await load(params);
  if (error) return error;
  const folderId = parseFolderId(new URL(req.url).searchParams.get("folder"));
  if (!folderId) return NextResponse.json({ error: "not_a_folder_id" }, { status: 400 });

  const files = await listFilesInSubfolder(eventId, folderId).catch(driveErrorResponse);
  if (files instanceof NextResponse) return files;
  const [people, participants, hashes, identity] = await Promise.all([
    prisma.child.findMany({ orderBy: [{ lastName: "asc" }, { name: "asc" }], select: { id: true, name: true, firstName: true, lastName: true, dateOfBirth: true } }),
    prisma.participant.findMany({ where: { eventId, childId: { not: null } }, select: { childId: true } }),
    prisma.personDocument.findMany({ where: { docKey: key }, select: { contentHash: true } }),
    getDriveIdentity(eventId),
  ]);
  const inEvent = new Set(participants.map((p) => p.childId!));
  const imported = new Set(hashes.map((h) => h.contentHash));

  return NextResponse.json({
    identity: identity.email,
    // Picker over Lidé: the event's participants first, nobody hidden.
    people: [...people]
      .sort((a, b) => Number(inEvent.has(b.id)) - Number(inEvent.has(a.id)))
      .map((p) => ({ id: p.id, name: p.name, dateOfBirth: p.dateOfBirth, participant: inEvent.has(p.id) })),
    files: files.map((f) => {
      const native = isGoogleNativeFile(f.mimeType);
      const skip = native
        ? isPdfExportable(f.mimeType) ? null : "native"
        : !FILE_TYPES.has(f.mimeType) ? "type" : (f.size ?? 0) > UPLOAD_MAX_BYTES ? "size" : null;
      const matches = matchPeople(f.name, people, inEvent);
      // Same hash as savePersonDocument (sha256, first 16 hex). Drive has none for native files.
      const already = !!f.sha256Checksum && imported.has(f.sha256Checksum.toLowerCase().slice(0, 16));
      return {
        id: f.id,
        name: f.name,
        webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
        status: skip ? "skipped" : already ? "already" : matches.length === 1 ? "matched" : matches.length ? "multiple" : "unmatched",
        reason: skip,
        matches,
      };
    }),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { user, error, eventId, key } = await load(params);
  if (error) return error;
  const body = await req.json().catch(() => null);
  const items: { fileId?: unknown; childId?: unknown; force?: unknown }[] = Array.isArray(body?.items) ? body.items : [];
  if (!items.length || items.length > BATCH) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // One by one; a failing file is reported in its row and the rest go on.
  const results = [];
  for (const it of items) {
    const fileId = typeof it.fileId === "string" ? it.fileId : "";
    const childId = typeof it.childId === "string" ? it.childId : "";
    try {
      if (!fileId || !childId || !(await prisma.child.findUnique({ where: { id: childId }, select: { id: true } }))) {
        results.push({ fileId, error: "not_found" });
        continue;
      }
      const meta = await getDriveFileMeta(eventId, fileId);
      const native = isGoogleNativeFile(meta.mimeType);
      if (native && !isPdfExportable(meta.mimeType)) {
        results.push({ fileId, error: "bad_file" });
        continue;
      }
      const buffer = native ? await exportFileAsPdf(eventId, fileId) : await downloadFileBuffer(eventId, fileId);
      // The person-page upload's checks (PDF / JPG / PNG by content, 15 MB) and store.
      const upload = await readUploadedFile(new File([new Uint8Array(buffer)], native ? `${meta.name}.pdf` : meta.name));
      if (!upload) {
        results.push({ fileId, error: "bad_file" });
        continue;
      }
      const hash = crypto.createHash("sha256").update(upload.buffer).digest("hex").slice(0, 16);
      if (it.force !== true && (await prisma.personDocument.findFirst({ where: { docKey: key, contentHash: hash }, select: { id: true } }))) {
        results.push({ fileId, error: "already" });
        continue;
      }
      await savePersonDocument({ childId, docKey: key, buffer: upload.buffer, contentHash: hash, contentType: upload.contentType, filename: upload.filename, userId: user.id });
      results.push({ fileId, ok: true });
    } catch (err) {
      console.error(`drive document import ${fileId} failed`, err);
      results.push({ fileId, error: err instanceof DriveError ? err.code : "failed" });
    }
  }
  return NextResponse.json({ results });
}
