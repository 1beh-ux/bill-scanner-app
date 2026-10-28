import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { iso, libraryGuard } from "@/lib/kitchen/server";
import { saveMeal } from "@/lib/kitchen/library-server";
import { learnedMultiplier } from "@/lib/kitchen/sizing";

// One meal: GET with lines, variants, notes and its history (where it was cooked, how it went, the learned
// multiplier); PATCH replaces it (confirmed / cooked plan entries keep their snapshot) or { archived: bool };
// DELETE only an unused meal (used -> 409 in_use: archive it instead).
const own = (organizationId: string, id: string) => prisma.meal.findFirst({ where: { id, organizationId }, select: { id: true, _count: { select: { planEntries: true } } } });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ mealId: string }> }) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const { mealId } = await params;
  const meal = await prisma.meal.findFirst({
    where: { id: mealId, organizationId: g.organizationId },
    include: {
      ingredients: { include: { ingredient: true }, orderBy: { sortOrder: "asc" } },
      variants: true,
      notes: { where: { OR: [{ eventId: null }, { event: { organizationId: g.organizationId } }] }, include: { event: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      parentMeal: { select: { id: true, name: true } },
      planEntries: { where: { event: { organizationId: g.organizationId } }, include: { event: { select: { id: true, name: true } }, feedback: true, slotItem: { select: { name: true } } }, orderBy: { date: "desc" }, take: 100 },
    },
  });
  if (!meal) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const samples = meal.planEntries.filter((e) => e.feedback).map((e) => ({ ...e.feedback!, eventId: e.eventId }));
  return NextResponse.json({
    ...meal,
    ingredients: meal.ingredients.map((l) => ({ ...l, qtyPerAdultPortion: Number(l.qtyPerAdultPortion), ingredient: { ...l.ingredient, packSize: l.ingredient.packSize == null ? null : Number(l.ingredient.packSize) } })),
    notes: meal.notes.map((n) => ({ id: n.id, body: n.body, eventId: n.eventId, eventName: n.event?.name ?? null, pinned: n.pinned, createdAt: n.createdAt })),
    planEntries: undefined,
    history: meal.planEntries.map((e) => ({ id: e.id, eventId: e.event.id, eventName: e.event.name, date: iso(e.date), slot: e.slotItem.name, status: e.status, feedback: e.feedback })),
    learned: learnedMultiplier(samples),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ mealId: string }> }) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const { mealId } = await params;
  if (!(await own(g.organizationId, mealId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.archived === "boolean" && b.name === undefined) {
    await prisma.meal.update({ where: { id: mealId }, data: { archivedAt: b.archived ? new Date() : null } });
    return NextResponse.json({ ok: true });
  }
  const r = await saveMeal(g.organizationId, mealId, b);
  return "error" in r ? NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 }) : NextResponse.json(r);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ mealId: string }> }) {
  const g = await libraryGuard();
  if ("error" in g) return g.error;
  const { mealId } = await params;
  const meal = await own(g.organizationId, mealId);
  if (!meal) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (meal._count.planEntries) return NextResponse.json({ error: "in_use" }, { status: 409 });
  await prisma.meal.delete({ where: { id: mealId } });
  return NextResponse.json({ ok: true });
}
