import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizePlanning, loadPlanPayload } from "@/lib/planning-server";
import { PLAN_WINDOW_KINDS, type PlanWindowKind } from "@/lib/planning";

type WindowInput = { id?: string; name: string; startMin: number; endMin: number; kind: PlanWindowKind };

function parseWindows(value: unknown): WindowInput[] | null {
  if (!Array.isArray(value)) return null;
  const out: WindowInput[] = [];
  for (const w of value) {
    if (!w || typeof w !== "object") return null;
    const { id, name, startMin, endMin, kind } = w as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) return null;
    if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) return null;
    if ((startMin as number) < 0 || (endMin as number) > 24 * 60 || (endMin as number) <= (startMin as number)) return null;
    if (!PLAN_WINDOW_KINDS.includes(kind as PlanWindowKind)) return null;
    out.push({ id: typeof id === "string" ? id : undefined, name: name.trim(), startMin: startMin as number, endMin: endMin as number, kind: kind as PlanWindowKind });
  }
  return out;
}

// Replaces a day's window set: listed ids are updated, new rows created, and
// windows left out are deleted with their slots (the client confirms first when
// that would drop scheduled activities). Order = sorted by start time.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; dayId: string }> }) {
  const { id: eventId, dayId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const day = await prisma.planDay.findFirst({ where: { id: dayId, eventId }, include: { windows: { select: { id: true } } } });
  if (!day) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const windows = parseWindows(body.windows);
  if (!windows) return NextResponse.json({ error: "invalid_windows" }, { status: 400 });

  const existingIds = new Set(day.windows.map((w) => w.id));
  // Ids not belonging to this day are treated as new rows, never as updates.
  const keep = new Set(windows.map((w) => w.id).filter((id): id is string => !!id && existingIds.has(id)));

  await prisma.$transaction(async (tx) => {
    await tx.planWindow.deleteMany({ where: { dayId, id: { notIn: [...keep] } } });
    const sorted = [...windows].sort((a, b) => a.startMin - b.startMin);
    for (const [sortOrder, w] of sorted.entries()) {
      const data = { name: w.name, startMin: w.startMin, endMin: w.endMin, kind: w.kind, sortOrder };
      if (w.id && keep.has(w.id)) await tx.planWindow.update({ where: { id: w.id }, data });
      else await tx.planWindow.create({ data: { ...data, dayId } });
    }
    // A window turned fixed can't hold slots.
    await tx.planSlot.deleteMany({ where: { window: { dayId, kind: "fixed" } } });
  });
  return NextResponse.json(await loadPlanPayload(eventId));
}
