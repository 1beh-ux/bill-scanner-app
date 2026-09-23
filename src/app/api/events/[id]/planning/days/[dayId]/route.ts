import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizePlanning, loadPlanPayload } from "@/lib/planning-server";

type Params = { params: Promise<{ id: string; dayId: string }> };

async function ownedDay(eventId: string, dayId: string) {
  return prisma.planDay.findFirst({ where: { id: dayId, eventId }, select: { id: true } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: eventId, dayId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;
  if (!(await ownedDay(eventId, dayId))) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: { label?: string; theme?: string | null; notes?: string | null; date?: Date | null } = {};
  if (body.label !== undefined) {
    if (typeof body.label !== "string" || !body.label.trim()) return NextResponse.json({ error: "label_required" }, { status: 400 });
    data.label = body.label.trim();
  }
  for (const key of ["theme", "notes"] as const) {
    if (body[key] !== undefined) data[key] = typeof body[key] === "string" && body[key].trim() ? body[key].trim() : null;
  }
  if (body.date !== undefined) {
    if (body.date !== null && (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date))) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }
    data.date = body.date ? new Date(`${body.date}T00:00:00Z`) : null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.planDay.update({ where: { id: dayId }, data });
    // Days follow their dates -- changing a date is how a day is reordered.
    // Undated days keep their place relative to each other, after dated ones.
    if (data.date !== undefined) {
      const days = await tx.planDay.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" }, select: { id: true, date: true } });
      const sorted = [...days].sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity));
      for (const [i, d] of sorted.entries()) await tx.planDay.update({ where: { id: d.id }, data: { sortOrder: i } });
    }
  });
  return NextResponse.json(await loadPlanPayload(eventId));
}

// Cascades to the day's windows, slots and blocks; remaining days are renumbered.
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: eventId, dayId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;
  if (!(await ownedDay(eventId, dayId))) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.planDay.delete({ where: { id: dayId } });
    const rest = await tx.planDay.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    for (const [i, d] of rest.entries()) await tx.planDay.update({ where: { id: d.id }, data: { sortOrder: i } });
  });
  return NextResponse.json(await loadPlanPayload(eventId));
}
