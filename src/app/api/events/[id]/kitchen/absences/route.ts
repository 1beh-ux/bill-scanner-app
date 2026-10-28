import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kitchenGuard, iso, isIsoDay } from "@/lib/kitchen/server";

// Who misses a meal (or a whole day): GET the list; POST { participantId | eventPersonId, date, slotItemId?, reason? };
// DELETE ?absenceId=. Exactly one person per row (also a DB CHECK).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const rows = await prisma.mealAbsence.findMany({
    where: { eventId: id },
    include: { participant: { select: { name: true } }, eventPerson: { select: { child: { select: { name: true } } } }, slotItem: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(rows.map((r) => ({ id: r.id, date: iso(r.date), slotItemId: r.slotItemId, slotName: r.slotItem?.name ?? null, reason: r.reason, participantId: r.participantId, eventPersonId: r.eventPersonId, name: r.participant?.name ?? r.eventPerson?.child.name ?? "" })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isIsoDay(b.date) || (typeof b.participantId === "string") === (typeof b.eventPersonId === "string")) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const person =
    typeof b.participantId === "string"
      ? await prisma.participant.findFirst({ where: { id: b.participantId, eventId: id }, select: { id: true } })
      : await prisma.eventPerson.findFirst({ where: { id: b.eventPersonId as string, eventId: id }, select: { id: true } });
  if (!person) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let slotItemId: string | null = null;
  if (typeof b.slotItemId === "string" && b.slotItemId) {
    const slot = await prisma.eventListItem.findFirst({ where: { id: b.slotItemId, eventId: id, kind: "kitchen_slot" }, select: { id: true } });
    if (!slot) return NextResponse.json({ error: "not_found" }, { status: 404 });
    slotItemId = slot.id;
  }
  const row = await prisma.mealAbsence.create({
    data: { eventId: id, date: new Date(`${b.date}T00:00:00Z`), slotItemId, reason: typeof b.reason === "string" ? b.reason.trim().slice(0, 200) || null : null, ...(typeof b.participantId === "string" ? { participantId: person.id } : { eventPersonId: person.id }) },
  });
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const r = await prisma.mealAbsence.deleteMany({ where: { id: new URL(req.url).searchParams.get("absenceId") ?? "", eventId: id } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
