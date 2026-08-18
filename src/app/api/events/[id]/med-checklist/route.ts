import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

// Checklist rows are computed from standing med plans, not stored ahead of
// time -- a MedChecklist row only gets created (via upsert, in POST) the
// first time someone actually toggles it for a given date. This GET
// left-joins the plans against whatever checklist rows already exist for
// the requested date.
export async function GET(
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

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const slotId = searchParams.get("slotId");
  if (!dateParam || !slotId) {
    return NextResponse.json({ error: "date_and_slot_required" }, { status: 400 });
  }
  const date = new Date(dateParam);

  const plans = await prisma.participantMedPlan.findMany({
    where: {
      eventSlotId: slotId,
      active: true,
      participant: { eventId, active: true },
    },
    include: {
      participant: { select: { id: true, name: true, groupName: true } },
      eventMed: { select: { id: true, name: true } },
    },
  });

  const checklistRows = await prisma.medChecklist.findMany({
    where: {
      eventSlotId: slotId,
      date,
      participantId: { in: plans.map((p) => p.participantId) },
    },
  });
  const givenByKey = new Map(
    checklistRows.map((c) => [`${c.participantId}:${c.eventMedId}`, c])
  );

  const result = plans.map((plan) => {
    const existing = givenByKey.get(`${plan.participantId}:${plan.eventMedId}`);
    return {
      participantId: plan.participant.id,
      participantName: plan.participant.name,
      participantGroup: plan.participant.groupName,
      eventMedId: plan.eventMed.id,
      medName: plan.eventMed.name,
      dose: plan.dose,
      notes: plan.notes,
      given: existing?.given ?? false,
      givenAt: existing?.givenAt ?? null,
    };
  });

  return NextResponse.json(result);
}

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
