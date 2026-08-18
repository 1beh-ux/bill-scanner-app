import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// One bulk fetch for a whole date range, instead of the single-day
// endpoint's one-date/one-slot shape -- built for the grid overview page.
// Rows are one per distinct (participant, med) pair with at least one
// active plan; each row lists which slots it actually applies to and a
// given/givenAt map per day x slot, left-joined against MedChecklist the
// same "computed, not pre-created" way as the single-day endpoint.
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
  const startParam = searchParams.get("startDate");
  const endParam = searchParams.get("endDate");
  if (!startParam || !endParam) {
    return NextResponse.json({ error: "date_range_required" }, { status: 400 });
  }
  const start = new Date(startParam);
  const end = new Date(endParam);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }

  const slots = await prisma.eventListItem.findMany({
    where: { eventId, kind: "slot", active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  const plans = await prisma.participantMedPlan.findMany({
    where: { active: true, participant: { eventId, active: true } },
    include: {
      participant: { select: { id: true, name: true, groupName: true } },
      eventMed: { select: { id: true, name: true } },
    },
  });

  type Row = {
    participantId: string;
    participantName: string;
    participantGroup: string | null;
    eventMedId: string;
    medName: string;
    slotIds: Set<string>;
  };
  const rowMap = new Map<string, Row>();
  for (const plan of plans) {
    const key = `${plan.participantId}:${plan.eventMedId}`;
    let row = rowMap.get(key);
    if (!row) {
      row = {
        participantId: plan.participant.id,
        participantName: plan.participant.name,
        participantGroup: plan.participant.groupName,
        eventMedId: plan.eventMed.id,
        medName: plan.eventMed.name,
        slotIds: new Set(),
      };
      rowMap.set(key, row);
    }
    row.slotIds.add(plan.eventSlotId);
  }

  const participantIds = [...new Set(plans.map((p) => p.participantId))];
  const medIds = [...new Set(plans.map((p) => p.eventMedId))];
  const checklistRows =
    participantIds.length === 0
      ? []
      : await prisma.medChecklist.findMany({
          where: {
            date: { gte: start, lte: end },
            participantId: { in: participantIds },
            eventMedId: { in: medIds },
          },
        });
  const givenIndex = new Map<string, { given: boolean; givenAt: string | null }>();
  for (const c of checklistRows) {
    const key = `${c.participantId}:${c.eventMedId}:${c.eventSlotId}:${toDateKey(c.date)}`;
    givenIndex.set(key, { given: c.given, givenAt: c.givenAt ? c.givenAt.toISOString() : null });
  }

  const days: string[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(toDateKey(d));
  }

  const rows = Array.from(rowMap.values()).map((row) => {
    const slotIds = Array.from(row.slotIds);
    const daysOut: Record<string, Record<string, { given: boolean; givenAt: string | null }>> = {};
    for (const day of days) {
      const perSlot: Record<string, { given: boolean; givenAt: string | null }> = {};
      for (const slotId of slotIds) {
        perSlot[slotId] = givenIndex.get(`${row.participantId}:${row.eventMedId}:${slotId}:${day}`) ?? {
          given: false,
          givenAt: null,
        };
      }
      daysOut[day] = perSlot;
    }
    return {
      participantId: row.participantId,
      participantName: row.participantName,
      participantGroup: row.participantGroup,
      eventMedId: row.eventMedId,
      medName: row.medName,
      slotIds,
      days: daysOut,
    };
  });

  return NextResponse.json({ slots, days, rows });
}
