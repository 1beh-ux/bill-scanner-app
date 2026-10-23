import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { participantGate } from "@/lib/participant-link";
import { readUploadedFile, storeParticipantFile } from "@/lib/participant-document-store";
import { takeRateSlot } from "@/lib/portal-rate";
import type { DocumentTypeData } from "@/lib/mail-reply-template";

// A document uploaded from the participant's own page -- the same rules and storage as the portal
// upload (src/app/api/portal/[token]/upload/route.ts): waits for an admin's review. multipart: docTypeId, file.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const g = await participantGate((await params).token, req.headers.get("x-birth-date"));
  if ("status" in g) return NextResponse.json({ error: "gate" }, { status: g.status });
  const p = g.p;
  const form = await req.formData().catch(() => null);
  const docTypeId = String(form?.get("docTypeId") ?? "");
  const docType = docTypeId ? await prisma.eventListItem.findUnique({ where: { id: docTypeId } }) : null;
  if (!docType || docType.eventId !== p.eventId || docType.kind !== "document" || !docType.active || docType.id === p.event.paymentDocTypeId || (docType.data as DocumentTypeData | null)?.allowPortalUpload !== true) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const upload = await readUploadedFile(form?.get("file"));
  if (!upload) return NextResponse.json({ error: "bad_file" }, { status: 400 });
  if (!(await takeRateSlot(`upload:${p.id}`, 20, 24 * 3600 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });
  const stored = await storeParticipantFile(p.eventId, p.id, upload.buffer, upload.filename, upload.contentType);
  await prisma.participantDocument.create({ data: { participantId: p.id, eventListItemId: docType.id, ...stored, receivedVia: "portal", receivedByUserId: null, reviewStatus: "pending" } });
  return NextResponse.json({ ok: true }, { status: 201 });
}
