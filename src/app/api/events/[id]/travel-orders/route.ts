import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

// Účtenky -> Cestovní příkazy of an event (Bills access). GET: the list. POST: a new draft (purpose = the event's
// name, its dates, today's approval date, one empty leg).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;
  const orders = await prisma.travelOrder.findMany({
    where: { eventId },
    orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, status: true, workerName: true, startAt: true, endAt: true, totalAmount: true, purpose: true, billId: true, bill: { select: { status: true, paidToAuthor: true } } },
  });
  return NextResponse.json(orders);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "bills");
  if (denied) return denied;
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true, startDate: true, endDate: true, status: true, organizationId: true } });
  if (event.status === "closed") return NextResponse.json({ error: "event_closed_locked" }, { status: 409 });
  const d = (x: Date, hm: string) => new Date(`${x.toISOString().slice(0, 10)}T${hm}:00Z`);
  const order = await prisma.travelOrder.create({
    data: {
      organizationId: event.organizationId,
      eventId,
      purpose: event.name,
      startAt: d(event.startDate, "08:00"),
      endAt: d(event.endDate, "20:00"),
      approvalDate: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`),
      createdByUserId: user.id,
      legs: { create: [{ sortOrder: 0 }] },
    },
    select: { id: true },
  });
  return NextResponse.json(order, { status: 201 });
}
