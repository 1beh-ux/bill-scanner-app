import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { billsBucket, sanitizeFilename } from "@/lib/gcs";
import { portalScope } from "@/lib/portal-server";
import { uploadContentType, UPLOAD_MAX_BYTES } from "@/lib/portal-rules";
import { takeRateSlot } from "@/lib/portal-rate";
import type { DocumentTypeData } from "@/lib/mail-reply-template";

// Upload instead of e-mail (docs/registration-slice3-spec.md F): a parent
// sends a document of a type that allows it (allowPortalUpload). PDF / JPG /
// PNG by content, max 15 MB, 20 per registration a day. Stored exactly like
// an e-mailed one (same GCS path convention, a ParticipantDocument row, Drive
// sync picks it up once approved) with receivedVia = portal and reviewStatus
// = pending: it counts as received only after an admin approves it (slice 4
// #6). The event's payment document type is never uploadable (slice 4 #5).
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
  if (!(file instanceof File) || file.size > UPLOAD_MAX_BYTES) return NextResponse.json({ error: "bad_file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = uploadContentType(buffer);
  if (!contentType) return NextResponse.json({ error: "bad_file" }, { status: 400 });
  if (!(await takeRateSlot(`upload:${participant.id}`, 20, 24 * 3600 * 1000))) return NextResponse.json({ error: "throttled" }, { status: 429 });

  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const filename = (file.name || "dokument").slice(0, 120);
  const gcsPath = `events/${participant.eventId}/mail/documents/${participant.id}/${hash}-${sanitizeFilename(filename)}`;
  await billsBucket.file(gcsPath).save(buffer, { contentType });
  await prisma.participantDocument.create({
    data: { participantId: participant.id, eventListItemId: docType.id, gcsPath, contentHash: hash, originalFilename: filename, receivedVia: "portal", receivedByUserId: null, reviewStatus: "pending" },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
