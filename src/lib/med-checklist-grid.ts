import { prisma } from "@/lib/prisma";

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type CellStatus = { given: boolean; givenAt: string | null };
export type GridRow = {
  participantId: string;
  participantName: string;
  participantGroup: string | null;
  eventMedId: string;
  medName: string;
  slotIds: string[];
  days: Record<string, Record<string, CellStatus>>;
};
export type GridResult = {
  slots: { id: string; name: string }[];
  days: string[];
  rows: GridRow[];
};

// One bulk fetch for a whole date range, instead of the single-day
// endpoint's one-date/one-slot shape. Rows are one per distinct
// (participant, med) pair with at least one active plan; each row lists
// which slots it actually applies to and a given/givenAt map per day x
// slot, left-joined against MedChecklist the same "computed, not
// pre-created" way as the single-day endpoint. Shared by the interactive
// grid page's API and the PDF export route so the two can't drift.
export async function fetchMedChecklistGrid(
  eventId: string,
  start: Date,
  end: Date
): Promise<GridResult> {
  const slots = await prisma.eventListItem.findMany({
    where: { eventId, kind: "slot", active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  const plans = await prisma.participantMedPlan.findMany({
    where: { active: true, participant: { eventId, active: true } },
    // Ordered so a participant's med rows always land contiguously in the
    // output -- both the meds grid page and the PDF export group/border
    // rows per participant and rely on that adjacency.
    orderBy: [{ participant: { name: "asc" } }, { eventMed: { name: "asc" } }],
    include: {
      participant: { select: { id: true, name: true, groupName: true } },
      eventMed: { select: { id: true, name: true } },
    },
  });

  type RowAccum = {
    participantId: string;
    participantName: string;
    participantGroup: string | null;
    eventMedId: string;
    medName: string;
    slotIds: Set<string>;
  };
  const rowMap = new Map<string, RowAccum>();
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
  const givenIndex = new Map<string, CellStatus>();
  for (const c of checklistRows) {
    const key = `${c.participantId}:${c.eventMedId}:${c.eventSlotId}:${toDateKey(c.date)}`;
    givenIndex.set(key, { given: c.given, givenAt: c.givenAt ? c.givenAt.toISOString() : null });
  }

  const days: string[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(toDateKey(d));
  }

  const rows: GridRow[] = Array.from(rowMap.values()).map((row) => {
    const slotIds = Array.from(row.slotIds);
    const daysOut: Record<string, Record<string, CellStatus>> = {};
    for (const day of days) {
      const perSlot: Record<string, CellStatus> = {};
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

  return { slots, days, rows };
}
