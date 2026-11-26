import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";
import { documentAttachmentsFor } from "@/lib/participant-bulk-email";
import type { DocumentTypeData } from "@/lib/mail-reply-template";

// "Vytvořit" on the participant detail (2026-11-26): this participant's document from the type's Google Doc template
// -- the same merge as the acceptance e-mail (variables, QR, the participant's Drive folder), stored as the generated
// document (not "received": that is the signed one handed back) and returned as the PDF. Nothing is sent.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; participantId: string; docTypeId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId, participantId, docTypeId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["participants", "health", "mail"]);
  if (denied) return denied;

  const [event, participant, docType] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    prisma.participant.findUnique({ where: { id: participantId }, select: { eventId: true } }),
    prisma.eventListItem.findUnique({ where: { id: docTypeId }, select: { eventId: true, kind: true, name: true, data: true } }),
  ]);
  if (!event || participant?.eventId !== eventId || docType?.eventId !== eventId || docType.kind !== "document") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(docType.data as DocumentTypeData | null)?.templateGoogleDocId) return NextResponse.json({ error: "no_template" }, { status: 400 });

  const r = await documentAttachmentsFor(participantId, event, [docTypeId], user.id, new Map());
  const pdf = r.attachments[0];
  if (!pdf) return NextResponse.json({ error: "generate_failed" }, { status: 502 });
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(pdf.filename)}` },
  });
}
