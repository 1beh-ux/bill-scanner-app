import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kitchenGuard, isIsoDay } from "@/lib/kitchen/server";

// A new plan entry: { date, slotItemId, mealId } (a library meal of this organization) or { customName }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await kitchenGuard(id);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isIsoDay(b.date) || typeof b.slotItemId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const slot = await prisma.eventListItem.findFirst({ where: { id: b.slotItemId, eventId: id, kind: "kitchen_slot" }, select: { id: true, data: true } });
  if (!slot) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let mealId: string | null = null;
  if (typeof b.mealId === "string") {
    const meal = await prisma.meal.findFirst({ where: { id: b.mealId, organizationId: g.event.organizationId }, select: { id: true } });
    if (!meal) return NextResponse.json({ error: "not_found" }, { status: 404 });
    mealId = meal.id;
  }
  const customName = typeof b.customName === "string" ? b.customName.trim().slice(0, 200) : "";
  if (!mealId && !customName) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const date = new Date(`${b.date}T00:00:00Z`);
  const last = await prisma.planEntry.findFirst({ where: { eventId: id, date, slotItemId: slot.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const entry = await prisma.planEntry.create({
    data: { eventId: id, date, slotItemId: slot.id, mealId, customName: mealId ? null : customName, servingTime: (slot.data as { time?: string } | null)?.time ?? null, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  return NextResponse.json(entry, { status: 201 });
}
