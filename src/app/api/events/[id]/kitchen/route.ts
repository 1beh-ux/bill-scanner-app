import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kitchenContext, kitchenGuard, iso, isIsoDay } from "@/lib/kitchen/server";
import { loadPlan, planJson } from "@/lib/kitchen/plan-server";
import { headcount } from "@/lib/kitchen/headcount";

// Jídelníček / Kuchyně dnes: GET the plan (?date= one day only) with headcount, checks and quantities, the
// slots, the adjustments and the "Cena na osobu a den" card; PATCH the event's kitchen settings.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const ctx = await kitchenContext(g.event);
  const date = new URL(req.url).searchParams.get("date");
  const rows = await loadPlan(ctx, id, g.event.organizationId, isIsoDay(date) ? { date: new Date(`${date}T00:00:00Z`) } : {});

  // Cena na osobu a den: food spend (the categories marked as potraviny, all bills) / person-days.
  const foodIds = ctx.settings.foodCategoryIds;
  const [spend, budget, categories, notes] = await Promise.all([
    foodIds.length ? prisma.billCategory.aggregate({ where: { eventCategoryId: { in: foodIds }, bill: { eventId: id } }, _sum: { amountCzk: true } }) : null,
    foodIds.length ? prisma.eventCategory.aggregate({ where: { id: { in: foodIds }, eventId: id }, _sum: { budgetAmount: true } }) : null,
    prisma.eventCategory.findMany({ where: { eventId: id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.mealNote.findMany({ where: { OR: [{ eventId: id }, { eventId: null, pinned: true }], meal: { organizationId: g.event.organizationId, id: { in: rows.map((r) => r.mealId).filter((x): x is string => !!x) } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const personDays = ctx.days.reduce((s, d) => s + headcount(d, "__day__", ctx.hc).eaters, 0);
  const spent = Number(spend?._sum.amountCzk ?? 0);
  return NextResponse.json({
    event: { id, name: g.event.name, startDate: iso(g.event.startDate), endDate: iso(g.event.endDate) },
    settings: ctx.settings,
    allergyFieldKey: ctx.allergyFieldKey,
    slots: ctx.slots,
    days: ctx.days,
    entries: planJson(rows),
    adjusts: ctx.adjusts.map((a) => ({ id: a.id, dateFrom: iso(a.dateFrom), dateTo: iso(a.dateTo), slotItemId: a.slotItemId, count: a.count, factor: Number(a.factor), label: a.label })),
    unverifiedDiets: ctx.diets.filter((d) => d.status === "unverified").length,
    notes: notes.map((n) => ({ id: n.id, mealId: n.mealId, body: n.body, eventId: n.eventId, pinned: n.pinned, createdAt: n.createdAt })),
    categories,
    cost: { foodSet: foodIds.length > 0, spent, budget: Number(budget?._sum.budgetAmount ?? 0), personDays, perPersonDay: personDays ? Math.round(spent / personDays) : null },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (b.allergyFieldKey !== undefined) data.allergyFieldKey = typeof b.allergyFieldKey === "string" && b.allergyFieldKey ? b.allergyFieldKey.slice(0, 100) : null;
  if (b.countOnlyAccepted !== undefined) data.countOnlyAccepted = b.countOnlyAccepted === true;
  if (b.feedbackUnlockMinutes !== undefined) data.feedbackUnlockMinutes = Math.max(0, Math.min(600, Math.round(Number(b.feedbackUnlockMinutes) || 0)));
  if (Array.isArray(b.foodCategoryIds)) {
    const own = await prisma.eventCategory.findMany({ where: { eventId: id, id: { in: b.foodCategoryIds.filter((x): x is string => typeof x === "string") } }, select: { id: true } });
    data.foodCategoryIds = own.map((c) => c.id);
  }
  const settings = await prisma.eventKitchenSettings.upsert({ where: { eventId: id }, create: { eventId: id, ...data }, update: data });
  return NextResponse.json(settings);
}
