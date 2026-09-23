import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizePlanning, copyPlanDay, loadPlanPayload } from "@/lib/planning-server";
import type { PlanDayTemplateData } from "@/lib/planning";

const DAY_MS = 24 * 60 * 60 * 1000;

// Adds a day at the end. Windows come from `source`:
//   "previous"            -- copy the last day's windows (no activities)
//   { templateId }        -- an event plan_day_template list item
//   { copyDayId }         -- a full copy of that day: windows + slots + blocks
//   "empty"               -- none
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const denied = await authorizePlanning(eventId);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const source = body.source;

  const [event, last] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { startDate: true } }),
    prisma.planDay.findFirst({ where: { eventId }, orderBy: { sortOrder: "desc" }, include: { windows: true } }),
  ]);

  const sortOrder = (last?.sortOrder ?? -1) + 1;
  const date = last?.date ? new Date(last.date.getTime() + DAY_MS) : event.startDate;

  if (source && typeof source === "object" && typeof source.copyDayId === "string") {
    const copied = await copyPlanDay(eventId, source.copyDayId, { sortOrder, date, label: `Den ${sortOrder + 1}` });
    if (!copied) return NextResponse.json({ error: "day_not_found" }, { status: 404 });
    return NextResponse.json(await loadPlanPayload(eventId), { status: 201 });
  }

  let windows: { name: string; startMin: number; endMin: number; kind: "flexible" | "partial" | "fixed"; color?: string | null }[] = [];
  if (source === "previous") {
    windows = last?.windows ?? [];
  } else if (source && typeof source === "object" && typeof source.templateId === "string") {
    const tpl = await prisma.eventListItem.findFirst({ where: { id: source.templateId, eventId, kind: "plan_day_template" } });
    if (!tpl) return NextResponse.json({ error: "template_not_found" }, { status: 404 });
    windows = ((tpl.data as PlanDayTemplateData | null)?.windows ?? []).filter(
      (w) => Number.isInteger(w.startMin) && Number.isInteger(w.endMin) && w.endMin > w.startMin
    );
  } else if (source !== "empty") {
    return NextResponse.json({ error: "invalid_source" }, { status: 400 });
  }

  await prisma.planDay.create({
    data: {
      eventId,
      sortOrder,
      date,
      label: `Den ${sortOrder + 1}`,
      windows: {
        create: [...windows]
          .sort((a, b) => a.startMin - b.startMin)
          .map((w, i) => ({ name: w.name, startMin: w.startMin, endMin: w.endMin, kind: w.kind, color: w.color ?? null, sortOrder: i })),
      },
    },
  });
  return NextResponse.json(await loadPlanPayload(eventId), { status: 201 });
}
