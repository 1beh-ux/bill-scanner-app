import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireAnyModuleAccess } from "@/lib/module-access";

// Manual document-received toggle for the Mail participants list -- covers
// the case where a document was handed over/scanned outside of email and
// there's nothing for the inbox attachment-matching flow to pick up. Same
// underlying row (ParticipantDocument, row existence = received) as the
// email-matched flow, just recorded with receivedVia: "manual" and no file.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string; docTypeId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId, participantId, docTypeId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  const existing = await prisma.participantDocument.findFirst({
    where: { participantId, eventListItemId: docTypeId },
  });
  // A `generated` row (we sent them a blank form, see
  // participant-document-store.ts) isn't actually "received" yet -- if
  // staff are marking this received (e.g. a parent handed in a printout
  // personally), upgrade it in place instead of the usual no-op, or the
  // toggle would silently do nothing.
  if (existing && existing.receivedVia !== "generated") return NextResponse.json(existing);
  if (existing) {
    const updated = await prisma.participantDocument.update({
      where: { id: existing.id },
      data: { receivedVia: "manual", receivedByUserId: user.id, receivedAt: new Date() },
    });
    return NextResponse.json(updated);
  }

  const created = await prisma.participantDocument.create({
    data: {
      participantId,
      eventListItemId: docTypeId,
      receivedVia: "manual",
      receivedByUserId: user.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string; docTypeId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId, participantId, docTypeId } = await params;
  const denied = await requireAnyModuleAccess(user, eventId, ["health", "mail"]);
  if (denied) return denied;

  await prisma.participantDocument.deleteMany({
    where: { participantId, eventListItemId: docTypeId },
  });
  return NextResponse.json({ ok: true });
}
