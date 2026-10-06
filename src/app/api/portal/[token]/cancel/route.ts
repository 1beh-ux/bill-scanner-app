import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { portalScope } from "@/lib/portal-server";
import { deleteParticipantCascade } from "@/lib/participant-delete";

// "Zrušit přihlášku": the parent withdraws one of their family's registrations
// while it is still PENDING -- the registration (and anything uploaded to it)
// is deleted like an admin delete. Once accepted, only the event's admin can
// remove it. Nothing is sent. { participantId }
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { scope, error } = await portalScope(token, true);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const participant =
    typeof body.participantId === "string"
      ? await prisma.participant.findUnique({ where: { id: body.participantId }, include: { event: { select: { status: true } } } })
      : null;
  const ok =
    participant &&
    scope.members.some((m) => m.id === participant.childId) &&
    participant.registrationStatus === "pending" &&
    participant.event.status === "active";
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await deleteParticipantCascade(participant.id);
  return NextResponse.json({ ok: true });
}
