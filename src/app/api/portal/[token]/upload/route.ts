import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUploadedFile, storeParticipantFile } from "@/lib/participant-document-store";
import { portalScope } from "@/lib/portal-server";
import { takeRateSlot } from "@/lib/portal-rate";
import { profileDocuments } from "@/lib/person-documents";
import type { DocumentTypeData } from "@/lib/mail-reply-template";

// Upload instead of e-mail (docs/registration-slice3-spec.md F): a parent
// sends a document of a type that allows it (allowPortalUpload). PDF / JPG /
// PNG by content, max 15 MB, 20 per registration a day. Stored exactly like
// an e-mailed one (same GCS path convention, a ParticipantDocument row, Drive
// sync picks it up once approved) with receivedVia = portal and reviewStatus
// = pending: it counts as received only after an admin approves it (slice 4
// #6). The event's payment document type is never uploadable (slice 4 #5), nor
// a type the person's permanent document already covers (slice 6 #4).
// multipart: participantId, docTypeId, file
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  const form = await req.formData().catch(() => null);
  const participantId = String(form?.get("participantId") ?? "");
  const docTypeId = String(form?.get("docTypeId") ?? "");
  const file = form?.get("file");

  const participant = participantId ? await prisma.participant.findUnique({ where: { id: participantId }, include: { event: true } }) : null;
  const docType = docTypeId ? await prisma.eventListItem.findUnique({ where: { id: docTypeId } }) : null;
  const ok =
    participant &&
    scope.members.some((m) => m.id === participant.childId) &&
    participant.event.status === "active" &&
    (participant.event.registrationConnected || participant.event.kind === "membership") &&
    docType?.eventId === participant.eventId &&
    docType.kind === "document" &&
    docType.active &&
    docType.id !== participant.event.paymentDocTypeId &&
    (docType.data as DocumentTypeData | null)?.allowPortalUpload === true;
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // Covered by the person's permanent document (slice 6 #4): not asked for.
  if ((await profileDocuments([participant])).get(participant.id)?.some((c) => c.eventListItemId === docType.id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const upload = await readUploadedFile(file);
  if (!upload) return NextResponse.json({ error: "bad_file" }, { status: 400 });
  if (!(await takeRateSlot(`upload:${participant.id}`, 20, 24 * 3600 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });

  const stored = await storeParticipantFile(participant.eventId, participant.id, upload.buffer, upload.filename, upload.contentType);
  await prisma.participantDocument.create({
    data: { participantId: participant.id, eventListItemId: docType.id, ...stored, receivedVia: "portal", receivedByUserId: null, reviewStatus: "pending" },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
