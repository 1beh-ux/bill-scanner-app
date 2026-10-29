import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adultsGuard, dayList } from "@/lib/adults-server";

// One adult on the event: PATCH { label?, days?, eats? } (days [] = the whole event); DELETE removes
// the assignment only -- the person stays in Lidé.
const own = (eventId: string, personId: string) => prisma.eventPerson.findFirst({ where: { id: personId, eventId }, select: { id: true } });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; personId: string }> }) {
  const { id, personId } = await params;
  const g = await adultsGuard(id);
  if ("error" in g) return g.error;
  if (!(await own(id, personId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const days = b.days === undefined ? undefined : dayList(b.days);
  if (days === null || (b.eats !== undefined && typeof b.eats !== "boolean")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  await prisma.eventPerson.update({
    where: { id: personId },
    data: {
      ...(b.label !== undefined && { label: typeof b.label === "string" ? b.label.trim().slice(0, 60) || null : null }),
      ...(days !== undefined && { days }),
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
