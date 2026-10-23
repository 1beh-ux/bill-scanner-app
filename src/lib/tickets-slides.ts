// Tickets from a Google Slides template (2026-10-23): for a small custom format (File -> Page setup)
// that Docs can't do. The FIRST slide is the ticket; text boxes hold {{variables}} (their font and
// size stay), and a shape whose text is exactly {{ticket_qr}} is replaced by the ticket's QR,
// fitted into that shape (so the shape's size and place decide the QR's). One copy per order: the
// slide is duplicated per ticket, each filled with its own values, exported as one PDF, deleted.
import type { slides_v1 } from "googleapis";
import QRCode from "qrcode";
import { getDriveClient, getSlidesClient, toDriveError, usingConnectedDriveAccount } from "@/lib/drive";
import { uploadTempImage } from "@/lib/document-merge";
import { billsBucket } from "@/lib/gcs";

export const SLIDES_MIME = "application/vnd.google-apps.presentation";

export async function renderTicketsSlides(eventId: string, templateId: string, pages: { vars: Record<string, string>; code: string }[]): Promise<Buffer> {
  try {
    return await run(eventId, templateId, pages);
  } catch (err) {
    throw await toDriveError(eventId, err, { purpose: "write" });
  }
}

async function run(eventId: string, templateId: string, pages: { vars: Record<string, string>; code: string }[]): Promise<Buffer> {
  const drive = await getDriveClient(eventId);
  const slides = await getSlidesClient(eventId);
  // A connected account's scratch copy goes to its own My Drive (it may not delete in a Shared Drive).
  const parents = (await usingConnectedDriveAccount(eventId)) ? ["root"] : undefined;
  const copy = await drive.files.copy({ fileId: templateId, requestBody: { name: `tickets-scratch-${Date.now()}`, ...(parents && { parents }) }, supportsAllDrives: true, fields: "id" });
  const id = copy.data.id!;
  const temp: string[] = [];
  try {
    const first = (await slides.presentations.get({ presentationId: id, fields: "slides.objectId" })).data.slides ?? [];
    if (!first.length) throw new Error("slides_template_empty");
    const ticketSlide = first[0].objectId!;
    const setup: slides_v1.Schema$Request[] = [
      // Only the first slide is the ticket; any others in the template are left out.
      ...first.slice(1).map((s) => ({ deleteObject: { objectId: s.objectId! } })),
      ...pages.slice(1).map(() => ({ duplicateObject: { objectId: ticketSlide } })),
    ];
    if (setup.length) await slides.presentations.batchUpdate({ presentationId: id, requestBody: { requests: setup } });
    const all = (await slides.presentations.get({ presentationId: id, fields: "slides.objectId" })).data.slides!.map((s) => s.objectId!);

    const requests: slides_v1.Schema$Request[] = [];
    for (const [i, p] of pages.entries()) {
      const pageObjectIds = [all[i]];
      const { path, url } = await uploadTempImage(await QRCode.toBuffer(p.code, { errorCorrectionLevel: "M", margin: 1, width: 600 }));
      temp.push(path);
      requests.push({ replaceAllShapesWithImage: { containsText: { text: "{{ticket_qr}}", matchCase: true }, imageUrl: url, imageReplaceMethod: "CENTER_INSIDE", pageObjectIds } });
      for (const [key, value] of Object.entries(p.vars)) requests.push({ replaceAllText: { containsText: { text: `{{${key}}}`, matchCase: true }, replaceText: value, pageObjectIds } });
    }
    await slides.presentations.batchUpdate({ presentationId: id, requestBody: { requests } });
    const pdf = await drive.files.export({ fileId: id, mimeType: "application/pdf" }, { responseType: "arraybuffer" });
    return Buffer.from(pdf.data as ArrayBuffer);
  } finally {
    await drive.files.delete({ fileId: id, supportsAllDrives: true }).catch(() => {});
    await Promise.all(temp.map((p) => billsBucket.file(p).delete().catch(() => {})));
  }
}
