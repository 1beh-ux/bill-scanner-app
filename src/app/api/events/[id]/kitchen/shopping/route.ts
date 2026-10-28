import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { iso, isIsoDay, kitchenContext, kitchenGuard } from "@/lib/kitchen/server";
import { loadPlan } from "@/lib/kitchen/plan-server";

// Nákup: what each day's meals need, per day of use, by store hint / category; PUT { ingredientId, forDate,
// checked?, qtyBought? } ticks a line off.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const ctx = await kitchenContext(g.event);
  const [rows, checks] = await Promise.all([loadPlan(ctx, id, g.event.organizationId), prisma.shoppingCheck.findMany({ where: { eventId: id } })]);
  const check = new Map(checks.map((c) => [`${c.ingredientId}|${iso(c.forDate)}`, c]));
  const days = new Map<string, Map<string, { ingredientId: string; name: string; unit: string; qty: number; storeHint: string | null; category: string | null; meals: string[] }>>();
  for (const r of rows) {
    const day = days.get(r.date) ?? new Map();
    days.set(r.date, day);
    for (const l of r.sheet.lines) {
      const x = day.get(l.ingredientId) ?? { ...l, qty: 0, meals: [] };
      x.qty += l.qty;
      if (!x.meals.includes(r.name)) x.meals.push(r.name);
      day.set(l.ingredientId, x);
    }
  }
  return NextResponse.json({
    event: { name: g.event.name },
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, m]) => ({
      date,
      lines: [...m.values()]
        .map((l) => ({ ...l, checked: check.get(`${l.ingredientId}|${date}`)?.checked ?? false, qtyBought: check.get(`${l.ingredientId}|${date}`)?.qtyBought == null ? null : Number(check.get(`${l.ingredientId}|${date}`)!.qtyBought) }))
        .sort((a, b) => (a.storeHint ?? "~").localeCompare(b.storeHint ?? "~", "cs") || (a.category ?? "~").localeCompare(b.category ?? "~", "cs") || a.name.localeCompare(b.name, "cs")),
    })),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.ingredientId !== "string" || !isIsoDay(b.forDate)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const ing = await prisma.ingredient.findFirst({ where: { id: b.ingredientId, organizationId: g.event.organizationId }, select: { id: true } });
  if (!ing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const forDate = new Date(`${b.forDate}T00:00:00Z`);
  const qty = b.qtyBought === undefined ? undefined : b.qtyBought === null || b.qtyBought === "" ? null : Number(b.qtyBought);
  if (qty !== undefined && qty !== null && !(Number.isFinite(qty) && qty >= 0)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const data = { ...(typeof b.checked === "boolean" && { checked: b.checked }), ...(qty !== undefined && { qtyBought: qty }) };
  await prisma.shoppingCheck.upsert({ where: { eventId_ingredientId_forDate: { eventId: id, ingredientId: ing.id, forDate } }, create: { eventId: id, ingredientId: ing.id, forDate, ...data }, update: data });
  return NextResponse.json({ ok: true });
}
