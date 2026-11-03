import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { calcOf, parseDraft, rateFor, requireOrderAccess } from "@/lib/travel-orders-server";

// The live calculation panel: the form as it is now (not saved) -> rate set + amounts. Nothing is written.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireOrderAccess((await params).id);
  if ("error" in a) return a.error;
  const { data, legs } = parseDraft((await req.json().catch(() => ({}))) as Record<string, unknown>);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: a.order.eventId }, select: { startDate: true } });
  const rate = await rateFor({ ...a.order, startAt: data.startAt }, event.startDate);
  const calc = calcOf({ ...data, tpValues: data.tpValues as Prisma.JsonValue, legs }, rate?.values ?? null);
  return NextResponse.json({ rate: rate && { id: rate.id, validFrom: rate.values.validFrom, note: rate.values.note, provisional: rate.provisional, frozen: rate.frozen }, calc });
}
