import { randomUUID } from "crypto";
import type { docs_v1 } from "googleapis";
import { getDriveClient, getDocsClient, usingConnectedDriveAccount } from "@/lib/drive";
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
// the Sheets-import route (src/app/api/events/[id]/health/participants/sheets-preview/route.ts).
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
  templateDocId: string,
  text: Record<string, string>,
  images: Record<string, Buffer> = {}
): Promise<Buffer> {
  const docId = extractGoogleDocId(templateDocId);
  const drive = await getDriveClient();
  const docs = await getDocsClient();

  // With a connected account the scratch copy goes to *its own* My Drive
  // root, not next to the template: the template's folder may be a Shared
  // Drive where that account can create but not delete/trash, which left
  // merge-scratch-* files piling up beside the templates.
  const scratchParents = (await usingConnectedDriveAccount()) ? ["root"] : undefined;
  const copy = await drive.files.copy({
    fileId: docId,
    requestBody: { name: `merge-scratch-${Date.now()}`, ...(scratchParents && { parents: scratchParents }) },
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
        const { path, url } = await uploadTempImage(buffer);
        tempImagePaths.push(path);
        await docs.documents.batchUpdate({
          documentId: scratchId,
          requestBody: {
            requests: [
              { deleteContentRange: { range: { startIndex: range.startIndex, endIndex: range.endIndex } } },
              { insertInlineImage: { uri: url, location: { index: range.startIndex } } },
            ],
          },
        });
      } catch (err) {
        console.log(`[document-merge] failed to insert image for {{${key}}} in ${templateDocId}:`, String(err));
      }
    }

    const exported = await drive.files.export(
      { fileId: scratchId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(exported.data as ArrayBuffer);
  } finally {
    await drive.files.delete({ fileId: scratchId, supportsAllDrives: true }).catch(() => {});
    await Promise.all(tempImagePaths.map((p) => billsBucket.file(p).delete().catch(() => {})));
  }
}
