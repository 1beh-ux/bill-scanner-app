import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { readUploadedFile, storeParticipantFile } from "@/lib/participant-document-store";
import { promoteToPersonDocument } from "@/lib/person-documents";

// "Nahrát soubor" on the participant detail (docs/registration-slice6-spec.md 3):
// an admin stores a file the parent handed over -- like the portal upload
// (same limits, same storage) but received right away (receivedVia = manual,
// with a file, no review). Of a permanent type it also becomes the person's document.
// multipart: file
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; participantId: string; docTypeId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId, participantId, docTypeId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const [participant, docType] = await Promise.all([
    prisma.participant.findUnique({ where: { id: participantId }, select: { eventId: true } }),
    prisma.eventListItem.findUnique({ where: { id: docTypeId }, select: { eventId: true, kind: true } }),
  ]);
  if (participant?.eventId !== eventId || docType?.eventId !== eventId || docType.kind !== "document") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const upload = await readUploadedFile((await req.formData().catch(() => null))?.get("file"));
  if (!upload) return NextResponse.json({ error: "bad_file" }, { status: 400 });

  const stored = await storeParticipantFile(eventId, participantId, upload.buffer, upload.filename, upload.contentType);
  const created = await prisma.participantDocument.create({
    data: { participantId, eventListItemId: docTypeId, ...stored, receivedVia: "manual", receivedByUserId: user.id },
  });
  await promoteToPersonDocument(created.id, user.id);
  return NextResponse.json(created, { status: 201 });
}
