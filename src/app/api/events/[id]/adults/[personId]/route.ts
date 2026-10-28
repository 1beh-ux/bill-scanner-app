import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adultsGuard, isoDay } from "@/lib/adults-server";

// One adult on the event: PATCH { label?, fromDate?, toDate?, eats? } (null dates = the event's); DELETE removes
// the assignment only -- the person stays in Lidé.
const own = (eventId: string, personId: string) => prisma.eventPerson.findFirst({ where: { id: personId, eventId }, select: { id: true } });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; personId: string }> }) {
  const { id, personId } = await params;
  const g = await adultsGuard(id);
  if ("error" in g) return g.error;
  if (!(await own(id, personId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const date = (v: unknown) => (v === null || v === "" ? null : isoDay(v));
  if ((b.fromDate !== undefined && b.fromDate !== null && b.fromDate !== "" && !isoDay(b.fromDate)) || (b.toDate !== undefined && b.toDate !== null && b.toDate !== "" && !isoDay(b.toDate)) || (b.eats !== undefined && typeof b.eats !== "boolean")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const from = b.fromDate === undefined ? undefined : date(b.fromDate);
  const to = b.toDate === undefined ? undefined : date(b.toDate);
  await prisma.eventPerson.update({
    where: { id: personId },
    data: {
      ...(b.label !== undefined && { label: typeof b.label === "string" ? b.label.trim().slice(0, 60) || null : null }),
      ...(from !== undefined && { fromDate: from ? new Date(from) : null }),
      ...(to !== undefined && { toDate: to ? new Date(to) : null }),
      ...(b.eats !== undefined && { eats: b.eats as boolean }),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; personId: string }> }) {
  const { id, personId } = await params;
  const g = await adultsGuard(id);
  if ("error" in g) return g.error;
  if (!(await own(id, personId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.eventPerson.delete({ where: { id: personId } });
  return NextResponse.json({ ok: true });
}
