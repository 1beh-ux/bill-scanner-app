import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

// Checklist rows are computed from standing med plans, not stored ahead of
// time -- a MedChecklist row only gets created (via upsert, here) the first
// time someone actually toggles it for a given date. Reads go through
// fetchMedChecklistGrid (see /api/events/[id]/med-checklist/grid) -- this
// route is toggle-only.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const body = await req.json();
  const { participantId, eventMedId, eventSlotId, date, given } = body;
  if (!participantId || !eventMedId || !eventSlotId || !date) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant || participant.eventId !== eventId) {
    return NextResponse.json({ error: "invalid_participant" }, { status: 400 });
  }

  const updated = await prisma.medChecklist.upsert({
    where: {
      participantId_eventMedId_eventSlotId_date: {
        participantId,
        eventMedId,
        eventSlotId,
        date: new Date(date),
      },
    },
    create: {
      participantId,
      eventMedId,
      eventSlotId,
      date: new Date(date),
      given: !!given,
      givenAt: given ? new Date() : null,
      givenByUserId: given ? user.id : null,
    },
    update: {
      given: !!given,
      givenAt: given ? new Date() : null,
      givenByUserId: given ? user.id : null,
    },
  });

  return NextResponse.json(updated);
}
