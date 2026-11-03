import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { calcOf, checkDraftIds, orderForm, parseDraft, rateFor, requireOrderAccess, type OrderWithLegs } from "@/lib/travel-orders-server";

// One travel order. GET: the form, its rate set and the live calculation. PATCH: save a draft. DELETE: a draft.
async function view(order: OrderWithLegs) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: order.eventId }, select: { id: true, name: true, startDate: true, status: true } });
  const rate = await rateFor(order, event.startDate);
  const bill = order.billId
    ? await prisma.bill.findUnique({ where: { id: order.billId }, select: { id: true, status: true, paidToAuthor: true, payerAuthorId: true, payerAuthor: { select: { canonicalName: true } } } })
    : null;
  return {
    order: orderForm(order),
    event,
    rate: rate && { id: rate.id, validFrom: rate.values.validFrom, note: rate.values.note, provisional: rate.provisional, frozen: rate.frozen },
    calc: calcOf(order, rate?.values ?? null),
    bill,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireOrderAccess((await params).id);
  if ("error" in a) return a.error;
  return NextResponse.json(await view(a.order));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireOrderAccess((await params).id);
  if ("error" in a) return a.error;
  if (a.order.status !== "draft") return NextResponse.json({ error: "submitted_locked" }, { status: 409 });
  const { data, legs } = parseDraft((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (await checkDraftIds(data, a.order.eventId, a.order.organizationId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.$transaction([
    prisma.travelLeg.deleteMany({ where: { orderId: a.order.id } }),
    prisma.travelOrder.update({ where: { id: a.order.id }, data: { ...data, tpValues: data.tpValues as Prisma.InputJsonValue, legs: { create: legs } } }),
  ]);
  const order = await prisma.travelOrder.findUniqueOrThrow({ where: { id: a.order.id }, include: { legs: { orderBy: { sortOrder: "asc" } } } });
  return NextResponse.json(await view(order));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireOrderAccess((await params).id);
  if ("error" in a) return a.error;
  if (a.order.status !== "draft" || a.order.billId) return NextResponse.json({ error: "submitted_locked" }, { status: 409 });
  await prisma.travelOrder.delete({ where: { id: a.order.id } });
  return NextResponse.json({ ok: true });
}
