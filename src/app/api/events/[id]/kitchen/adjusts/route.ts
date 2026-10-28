import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kitchenGuard, isIsoDay } from "@/lib/kitchen/server";

// Anonymous headcount changes ("+3 hosté", "−12 výlet bez oběda"): POST { dateFrom, dateTo, slotItemId?, count, factor?, label };
// DELETE ?adjustId=.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const count = Math.round(Number(b.count));
  const factor = b.factor == null || b.factor === "" ? 1 : Number(b.factor);
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 200) : "";
  if (!isIsoDay(b.dateFrom) || !isIsoDay(b.dateTo) || b.dateTo < b.dateFrom || !count || Math.abs(count) > 10000 || !(factor > 0 && factor < 5) || !label) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  let slotItemId: string | null = null;
  if (typeof b.slotItemId === "string" && b.slotItemId) {
    const slot = await prisma.eventListItem.findFirst({ where: { id: b.slotItemId, eventId: id, kind: "kitchen_slot" }, select: { id: true } });
    if (!slot) return NextResponse.json({ error: "not_found" }, { status: 404 });
    slotItemId = slot.id;
  }
  const row = await prisma.headcountAdjust.create({ data: { eventId: id, dateFrom: new Date(`${b.dateFrom}T00:00:00Z`), dateTo: new Date(`${b.dateTo}T00:00:00Z`), slotItemId, count, factor, label } });
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const adjustId = new URL(req.url).searchParams.get("adjustId") ?? "";
  const r = await prisma.headcountAdjust.deleteMany({ where: { id: adjustId, eventId: id } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
