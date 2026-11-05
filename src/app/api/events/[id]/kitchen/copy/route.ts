import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/module-access";
import { ensureKitchenLists, eventDays, iso, kitchenGuard } from "@/lib/kitchen/server";

// "Kopírovat z minulé akce": GET the organization's other events with a plan (the user's kitchen access);
// POST { fromEventId } copies their entries day by day (day 1 -> day 1, slots matched by name) as drafts --
// without accepted multipliers or feedback: every proposal is decided again on this event.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const events = await prisma.event.findMany({
    where: { organizationId: g.event.organizationId, id: { not: id }, planEntries: { some: {} }, isTest: false },
    select: { id: true, name: true, startDate: true, _count: { select: { planEntries: true } } },
    orderBy: { startDate: "desc" },
  });
  const allowed = [];
  for (const e of events) if (await hasModuleAccess(g.user, e.id, "kitchen")) allowed.push({ id: e.id, name: e.name, startDate: iso(e.startDate), entries: e._count.planEntries });
  return NextResponse.json(allowed);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const from = typeof b.fromEventId === "string" ? await prisma.event.findFirst({ where: { id: b.fromEventId, organizationId: g.event.organizationId }, select: { id: true, startDate: true, endDate: true } }) : null;
  if (!from || !(await hasModuleAccess(g.user, from.id, "kitchen"))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await ensureKitchenLists(id, g.event.organizationId);
  const [entries, srcSlots, dstSlots] = await Promise.all([
    prisma.planEntry.findMany({ where: { eventId: from.id }, include: { slotItem: { select: { name: true } } } }),
    eventDays(from.startDate, from.endDate),
    prisma.eventListItem.findMany({ where: { eventId: id, kind: "kitchen_slot" }, select: { id: true, name: true } }),
  ]);
  const days = eventDays(g.event.startDate, g.event.endDate);
  const slotByName = new Map(dstSlots.map((s) => [s.name.trim().toLowerCase(), s.id]));
  const data = entries.flatMap((e) => {
    const day = days[srcSlots.indexOf(iso(e.date))];
    const slotItemId = slotByName.get(e.slotItem.name.trim().toLowerCase());
    if (!day || !slotItemId) return [];
    return [{ eventId: id, date: new Date(`${day}T00:00:00Z`), slotItemId, mealId: e.mealId, customName: e.customName, variantIds: e.variantIds, servingTime: e.servingTime, note: e.note, sortOrder: e.sortOrder }];
  });
  await prisma.planEntry.createMany({ data });
  return NextResponse.json({ copied: data.length, skipped: entries.length - data.length });
}
