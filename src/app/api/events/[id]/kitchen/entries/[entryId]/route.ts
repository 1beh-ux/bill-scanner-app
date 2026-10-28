import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kitchenGuard, isIsoDay } from "@/lib/kitchen/server";

// One plan entry. PATCH: move (date, slotItemId), variants, headcount (mode, manualPortions), servingTime,
// note, sizingMultiplier (only from "Použít" -- the client sends the shown proposal; null = back to 1).
// A confirmed / cooked entry keeps its snapshot: only the note, serving time and move are allowed until
// "Znovu otevřít". DELETE removes it.
const own = (eventId: string, entryId: string) => prisma.planEntry.findFirst({ where: { id: entryId, eventId }, include: { meal: { select: { variants: { select: { id: true } } } } } });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const entry = await own(id, entryId);
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (b.date !== undefined || b.slotItemId !== undefined) {
    if (b.date !== undefined && !isIsoDay(b.date)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    if (b.slotItemId !== undefined) {
      const slot = typeof b.slotItemId === "string" ? await prisma.eventListItem.findFirst({ where: { id: b.slotItemId, eventId: id, kind: "kitchen_slot" }, select: { id: true } }) : null;
      if (!slot) return NextResponse.json({ error: "not_found" }, { status: 404 });
      data.slotItemId = slot.id;
    }
    if (b.date !== undefined) data.date = new Date(`${b.date}T00:00:00Z`);
  }
  if (b.note !== undefined) data.note = typeof b.note === "string" ? b.note.trim().slice(0, 2000) || null : null;
  if (b.servingTime !== undefined) data.servingTime = typeof b.servingTime === "string" && /^\d{2}:\d{2}$/.test(b.servingTime) ? b.servingTime : null;
  if (b.sortOrder !== undefined && Number.isInteger(b.sortOrder)) data.sortOrder = b.sortOrder;
  const locked = entry.status !== "draft";
  const touchesRecipe = ["variantIds", "headcountMode", "manualPortions", "sizingMultiplier", "customName"].some((k) => b[k] !== undefined);
  if (locked && touchesRecipe) return NextResponse.json({ error: "entry_confirmed" }, { status: 409 });
  if (Array.isArray(b.variantIds)) {
    const allowed = new Set(entry.meal?.variants.map((v) => v.id) ?? []);
    data.variantIds = [...new Set(b.variantIds.filter((v): v is string => typeof v === "string" && allowed.has(v)))];
  }
  if (b.headcountMode === "auto" || b.headcountMode === "manual") data.headcountMode = b.headcountMode;
  if (b.manualPortions !== undefined) {
    const n = b.manualPortions === null ? null : Number(b.manualPortions);
    if (n !== null && !(Number.isFinite(n) && n >= 0 && n < 100000)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    data.manualPortions = n;
  }
  if (b.sizingMultiplier !== undefined) {
    const m = b.sizingMultiplier === null ? null : Number(b.sizingMultiplier);
    if (m !== null && !(Number.isFinite(m) && m > 0.2 && m < 5)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    data.sizingMultiplier = m;
  }
  if (b.customName !== undefined && !entry.mealId) data.customName = typeof b.customName === "string" ? b.customName.trim().slice(0, 200) || entry.customName : entry.customName;
  const updated = await prisma.planEntry.update({ where: { id: entryId }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  if (!(await own(id, entryId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.planEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}
