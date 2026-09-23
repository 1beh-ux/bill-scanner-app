import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import type { PlanBlockRow, PlanDayRow, PlanPayload, PlanSlotRow, PlanState, PlanWindowRow } from "@/lib/planning";
import { fieldsOf } from "@/lib/planning-moves";

type Db = Prisma.TransactionClient | typeof prisma;

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function loadPlanState(eventId: string, db: Db = prisma) {
  const days = await db.planDay.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } });
  const dayIds = days.map((d) => d.id);
  const windows = await db.planWindow.findMany({ where: { dayId: { in: dayIds } }, orderBy: { sortOrder: "asc" } });
  const windowIds = windows.map((w) => w.id);
  const slots = await db.planSlot.findMany({ where: { windowId: { in: windowIds } }, orderBy: { position: "asc" } });
  const blocks = await db.planBlock.findMany({ where: { slotId: { in: slots.map((s) => s.id) } }, orderBy: { branchOrder: "asc" } });

  const state: PlanState = {
    windows: windows.map(
      (w): PlanWindowRow => ({ id: w.id, dayId: w.dayId, name: w.name, startMin: w.startMin, endMin: w.endMin, kind: w.kind, color: w.color, sortOrder: w.sortOrder })
    ),
    slots: slots.map((s): PlanSlotRow => ({ id: s.id, windowId: s.windowId, durationMin: s.durationMin, position: s.position, notes: s.notes })),
    blocks: blocks.map(
      (b): PlanBlockRow => ({
        id: b.id,
        slotId: b.slotId,
        branchOrder: b.branchOrder,
        activityId: b.activityId,
        customName: b.customName,
        description: b.description,
        primaryCategoryId: b.primaryCategoryId,
        secondaryCategoryId: b.secondaryCategoryId,
        leaderId: b.leaderId,
        locationId: b.locationId,
        notes: b.notes,
      })
    ),
  };
  const dayRows: PlanDayRow[] = days.map((d) => ({
    id: d.id,
    date: isoDate(d.date),
    label: d.label,
    theme: d.theme,
    notes: d.notes,
    sortOrder: d.sortOrder,
  }));
  return { days: dayRows, state };
}

// Everything the board needs in one request.
export async function loadPlanPayload(eventId: string): Promise<PlanPayload> {
  const [event, plan, activities, listItems, baseActivities] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true, name: true, startDate: true, endDate: true } }),
    loadPlanState(eventId),
    prisma.planActivity.findMany({ where: { eventId, active: true }, orderBy: { name: "asc" } }),
    prisma.eventListItem.findMany({
      where: { eventId, active: true, kind: { in: ["plan_category", "plan_location", "plan_leader", "plan_day_template"] } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, kind: true, name: true, data: true },
    }),
    prisma.listTemplate.findMany({
      where: { kind: "plan_activity", active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, data: true },
    }),
  ]);
  // `data` JSON holds the plan_* shapes from src/lib/planning.ts.
  const ofKind = (kind: string) => listItems.filter((i) => i.kind === kind).map(({ id, name, data }) => ({ id, name, data: data as never }));
  return {
    event: { id: event.id, name: event.name, startDate: isoDate(event.startDate), endDate: isoDate(event.endDate) },
    days: plan.days,
    ...plan.state,
    activities,
    categories: ofKind("plan_category"),
    locations: ofKind("plan_location"),
    leaders: ofKind("plan_leader"),
    dayTemplates: ofKind("plan_day_template"),
    baseActivities: baseActivities.map(({ id, name, data }) => ({ id, name, data: data as never })),
  };
}

/**
 * Writes the difference between two PlanStates (slots and blocks only --
 * windows are edited through their own route). Order matters: blocks moved out
 * of a slot must be re-pointed before that slot is deleted (FK cascade).
 */
export async function persistPlanDiff(tx: Prisma.TransactionClient, before: PlanState, after: PlanState) {
  const beforeSlots = new Map(before.slots.map((s) => [s.id, s]));
  const afterSlots = new Map(after.slots.map((s) => [s.id, s]));
  const beforeBlocks = new Map(before.blocks.map((b) => [b.id, b]));
  const afterBlocks = new Map(after.blocks.map((b) => [b.id, b]));

  const newSlots = after.slots.filter((s) => !beforeSlots.has(s.id));
  if (newSlots.length) await tx.planSlot.createMany({ data: newSlots });

  for (const s of after.slots) {
    const prev = beforeSlots.get(s.id);
    if (prev && (prev.windowId !== s.windowId || prev.position !== s.position || prev.durationMin !== s.durationMin)) {
      await tx.planSlot.update({ where: { id: s.id }, data: { windowId: s.windowId, position: s.position, durationMin: s.durationMin } });
    }
  }

  const newBlocks = after.blocks.filter((b) => !beforeBlocks.has(b.id));
  if (newBlocks.length) {
    await tx.planBlock.createMany({ data: newBlocks.map((b) => ({ ...fieldsOf(b), id: b.id, slotId: b.slotId, branchOrder: b.branchOrder })) });
  }
  for (const b of after.blocks) {
    const prev = beforeBlocks.get(b.id);
    if (prev && (prev.slotId !== b.slotId || prev.branchOrder !== b.branchOrder)) {
      await tx.planBlock.update({ where: { id: b.id }, data: { slotId: b.slotId, branchOrder: b.branchOrder } });
    }
  }

  const goneBlocks = before.blocks.filter((b) => !afterBlocks.has(b.id)).map((b) => b.id);
  if (goneBlocks.length) await tx.planBlock.deleteMany({ where: { id: { in: goneBlocks } } });
  const goneSlots = before.slots.filter((s) => !afterSlots.has(s.id)).map((s) => s.id);
  if (goneSlots.length) await tx.planSlot.deleteMany({ where: { id: { in: goneSlots } } });
}

/** Auth + module gate shared by every /api/events/[id]/planning route. */
export async function authorizePlanning(eventId: string): Promise<NextResponse | null> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return requireModuleAccess(user, eventId, "planning");
}

/** Full copy of a day (windows + slots + blocks) as a new day. Null if the source isn't this event's. */
export async function copyPlanDay(eventId: string, sourceDayId: string, as: { sortOrder: number; date: Date | null; label: string }) {
  const src = await prisma.planDay.findFirst({
    where: { id: sourceDayId, eventId },
    include: { windows: { include: { slots: { include: { blocks: true } } } } },
  });
  if (!src) return null;
  return prisma.planDay.create({
    data: {
      eventId,
      ...as,
      theme: src.theme,
      notes: src.notes,
      windows: {
        create: src.windows.map((w) => ({
          name: w.name, startMin: w.startMin, endMin: w.endMin, kind: w.kind, color: w.color, notes: w.notes, sortOrder: w.sortOrder,
          slots: {
            create: w.slots.map((s) => ({
              durationMin: s.durationMin, position: s.position, notes: s.notes,
              blocks: { create: s.blocks.map((b) => ({ ...fieldsOf(b), branchOrder: b.branchOrder })) },
            })),
          },
        })),
      },
    },
  });
}
