import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrderAccess } from "@/lib/travel-orders-server";

// Zkopírovat pro jiného pracovníka: a new draft in the same event with the same trip and legs (km, times, amounts);
// worker, car, payout, rates and computed amounts are left empty.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireOrderAccess((await params).id);
  if ("error" in a) return a.error;
  const o = a.order;
  const copy = await prisma.travelOrder.create({
    data: {
      organizationId: o.organizationId,
      eventId: o.eventId,
      purpose: o.purpose,
      originPlace: o.originPlace,
      destinationPlace: o.destinationPlace,
      roundTrip: o.roundTrip,
      startAt: o.startAt,
      endAt: o.endAt,
      approvalDate: o.approvalDate,
      approverName: o.approverName,
      coTravellers: o.coTravellers,
      freeMeals: o.freeMeals ?? undefined,
      createdByUserId: a.user.id,
      legs: { create: o.legs.map((l) => ({ sortOrder: l.sortOrder, date: l.date, fromPlace: l.fromPlace, toPlace: l.toPlace, departTime: l.departTime, arriveTime: l.arriveTime, trailer: l.trailer, km: l.km, stravne: l.stravne, nocleh: l.nocleh, vedlejsi: l.vedlejsi })) },
    },
    select: { id: true },
  });
  return NextResponse.json(copy, { status: 201 });
}
