import { randomUUID } from "crypto";
import type { docs_v1 } from "googleapis";
import { getDriveClient, getDocsClient, usingConnectedDriveAccount, findFileInFolder, toDriveError } from "@/lib/drive";
import { billsBucket } from "@/lib/gcs";

/**
 * Recursively walks a Docs API structural-content tree (paragraphs, and
 * paragraphs nested inside table cells) looking for a text run that
 * contains `needle` verbatim. Google Docs sometimes splits a paragraph's
 * text across multiple runs (e.g. after prior edits/formatting changes) --
 * this only matches a needle that's fully contained in a single run, which
 * covers an untouched `{{picture}}` placeholder but is a known limitation
 * if someone re-types the placeholder by hand across a formatting boundary.
 */
function findPlaceholderRange(
  content: docs_v1.Schema$StructuralElement[] | undefined,
  needle: string
): { startIndex: number; endIndex: number } | null {
  for (const el of content ?? []) {
    for (const pe of el.paragraph?.elements ?? []) {
      const text = pe.textRun?.content;
      if (text && pe.startIndex != null) {
        const offset = text.indexOf(needle);
        if (offset !== -1) {
          return { startIndex: pe.startIndex + offset, endIndex: pe.startIndex + offset + needle.length };
        }
      }
    }
    for (const row of el.table?.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) {
        const found = findPlaceholderRange(cell.content, needle);
        if (found) return found;
      }
    }
  }
  return null;
}

const PLACEHOLDER_PATTERN = /\{\{[^{}]+\}\}/g;

/**
 * Same tree walk as findPlaceholderRange, but collects every `{{...}}`-shaped
 * run of text still in the document, whatever's inside the braces. Used as
 * the final safety net after the known-key substitution pass (Part 11-I of
 * the participants/settings/Health/Mail prompt: a generated PDF must never
 * contain a raw `{{...}}`, whatever the reason a given key wasn't resolved --
 * unknown key, a field not flagged for the `documents` surface, or anything
 * else this file's author didn't think of).
 */
function collectRemainingPlaceholders(content: docs_v1.Schema$StructuralElement[] | undefined): Set<string> {
  const found = new Set<string>();
  for (const el of content ?? []) {
    for (const pe of el.paragraph?.elements ?? []) {
      const text = pe.textRun?.content;
      if (text) for (const m of text.matchAll(PLACEHOLDER_PATTERN)) found.add(m[0]);
    }
    for (const row of el.table?.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) {
        for (const placeholder of collectRemainingPlaceholders(cell.content)) found.add(placeholder);
      }
    }
  }
  return found;
}

/**
 * Briefly uploads `buffer` to the bills GCS bucket and returns a v4 signed
 * read URL -- the Docs API's insertInlineImage request only accepts a
 * fetchable URI, not raw bytes or a data: URI. Caller must delete the
 * object once the merge is done (see the `finally` in
 * mergeAndExportDocument).
 */
async function uploadTempImage(buffer: Buffer): Promise<{ path: string; url: string }> {
  const path = `merge-temp/${randomUUID()}.png`;
  const file = billsBucket.file(path);
  await file.save(buffer, { contentType: "image/png" });
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 10 * 60 * 1000,
  });
  return { path, url };
}

// Accepts either a bare doc ID or a full Google Docs URL -- same shape a
// user would paste from their browser bar. Mirrors extractSpreadsheetId in
// src/lib/sheet-import.ts.
export function extractGoogleDocId(input: string): string {
  const urlMatch = input.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  return (urlMatch ? urlMatch[1] : input).trim();
}

/**
 * Copies `templateDocId`, replaces every `{{key}}` in `text` with its
 * value, drops each `images` entry in place of its own `{{key}}`
 * placeholder (best-effort -- a placeholder that isn't found, or an image
 * insertion failure, is logged and skipped rather than failing the whole
 * merge, since a document missing one QR code is far better than no
 * document at all), exports the result as PDF, and cleans up the scratch
 * copy + any temp image uploads.
 */
export async function mergeAndExportDocument(
  eventId: string,
  templateDocId: string,
  text: Record<string, string>,
  images: Record<string, Buffer> = {},
  keep?: { folderId: string; name: string },
  imageSizesMm: Record<string, number> = {}
): Promise<Buffer> {
  try {
    return await mergeAndExportDocumentRaw(eventId, templateDocId, text, images, keep, imageSizesMm);
  } catch (err) {
    // Known Google failures come out as DriveError (with the event's identity in
    // the message); a dead refresh token is recorded so the event falls back.
    throw await toDriveError(eventId, err, { purpose: "write" });
  }
}

async function mergeAndExportDocumentRaw(
  eventId: string,
  templateDocId: string,
  text: Record<string, string>,
  images: Record<string, Buffer> = {},
  // When given, the merged Google Doc is kept in this folder under `name`
  // (so it can be edited and the PDF re-created later) instead of being
  // deleted after the export. An older doc with the same name is trashed
  // afterwards, best effort -- in a Shared Drive the connected account may
  // not be allowed to, in which case the old one just stays.
  keep?: { folderId: string; name: string },
  // Side length in mm per image key. Without an explicit size Google Docs
  // inserts an image at its pixel size, which is huge for a QR code.
  imageSizesMm: Record<string, number> = {}
): Promise<Buffer> {
  const docId = extractGoogleDocId(templateDocId);
  const drive = await getDriveClient(eventId);
  const docs = await getDocsClient(eventId);

  // With a connected account the scratch copy goes to *its own* My Drive
  // root, not next to the template: the template's folder may be a Shared
  // Drive where that account can create but not delete/trash, which left
  // merge-scratch-* files piling up beside the templates.
  const scratchParents = keep ? [keep.folderId] : (await usingConnectedDriveAccount(eventId)) ? ["root"] : undefined;
  const previousDoc = keep ? await findFileInFolder(eventId, keep.folderId, keep.name, "application/vnd.google-apps.document") : null;
  const copy = await drive.files.copy({
    fileId: docId,
    requestBody: { name: keep ? keep.name : `merge-scratch-${Date.now()}`, ...(scratchParents && { parents: scratchParents }) },
    supportsAllDrives: true,
    fields: "id",
  });
  const scratchId = copy.data.id;
  if (!scratchId) throw new Error("Drive copy returned no file id for template " + docId);

  const tempImagePaths: string[] = [];

  try {
    const textRequests: docs_v1.Schema$Request[] = Object.entries(text)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => ({
        replaceAllText: {
          containsText: { text: `{{${key}}}`, matchCase: true },
          replaceText: value,
        },
      }));
    if (textRequests.length > 0) {
      await docs.documents.batchUpdate({ documentId: scratchId, requestBody: { requests: textRequests } });
    }

    for (const [key, buffer] of Object.entries(images)) {
      try {
        const doc = await docs.documents.get({ documentId: scratchId });
        const range = findPlaceholderRange(doc.data.body?.content, `{{${key}}}`);
        if (!range) {
          console.log(`[document-merge] placeholder {{${key}}} not found in ${templateDocId}, skipping image`);
          continue;
        }
        const sizePt = ((imageSizesMm[key] ?? 35) * 72) / 25.4; // mm -> pt
        const { path, url } = await uploadTempImage(buffer);
        tempImagePaths.push(path);
        await docs.documents.batchUpdate({
          documentId: scratchId,
          requestBody: {
            requests: [
              { deleteContentRange: { range: { startIndex: range.startIndex, endIndex: range.endIndex } } },
              {
                insertInlineImage: {
                  uri: url,
                  location: { index: range.startIndex },
                  objectSize: {
                    width: { magnitude: sizePt, unit: "PT" },
                    height: { magnitude: sizePt, unit: "PT" },
                  },
                },
              },
            ],
          },
        });
      } catch (err) {
        console.log(`[document-merge] failed to insert image for {{${key}}} in ${templateDocId}:`, String(err));
      }
    }

    // Safety net: whatever the reason (unknown key, a field not flagged for the
    // `documents` surface, an image that couldn't be generated -- e.g. {{picture}}
    // when the camp fee/bank account aren't set), a raw {{...}} must never reach the
    // exported PDF. Re-scan the doc and blank anything still shaped like a
    // placeholder. Logged (not silent) so a real missing-field bug still shows up
    // somewhere, even though the document itself now reads clean.
    const finalDoc = await docs.documents.get({ documentId: scratchId });
    const leftover = collectRemainingPlaceholders(finalDoc.data.body?.content);
    if (leftover.size > 0) {
      console.log(`[document-merge] blanking unresolved placeholder(s) in ${templateDocId}:`, [...leftover].join(", "));
      await docs.documents.batchUpdate({
        documentId: scratchId,
        requestBody: {
          requests: [...leftover].map((placeholder) => ({
            replaceAllText: { containsText: { text: placeholder, matchCase: true }, replaceText: "" },
          })),
        },
      });
    }

    const exported = await drive.files.export(
      { fileId: scratchId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" }
    );
    if (previousDoc) {
      await drive.files.update({ fileId: previousDoc.id, requestBody: { trashed: true }, supportsAllDrives: true }).catch(() => {});
    }
    return Buffer.from(exported.data as ArrayBuffer);
  } catch (err) {
    // A kept doc is only worth keeping if the whole merge worked.
    if (keep) await drive.files.delete({ fileId: scratchId, supportsAllDrives: true }).catch(() => {});
    throw err;
  } finally {
    if (!keep) await drive.files.delete({ fileId: scratchId, supportsAllDrives: true }).catch(() => {});
    await Promise.all(tempImagePaths.map((p) => billsBucket.file(p).delete().catch(() => {})));
  }
}
