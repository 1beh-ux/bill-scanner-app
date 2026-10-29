import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adultsGuard } from "@/lib/adults-server";

// "Přidat z lidí": the organization's adults (active ones), each with whether it is already on this event.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await adultsGuard(id);
  if ("error" in g) return g.error;
  const people = await prisma.child.findMany({
    where: { organizationId: g.event.organizationId, isAdult: true, leftAt: null },
    orderBy: [{ lastName: "asc" }, { name: "asc" }],
    select: { id: true, name: true, dateOfBirth: true, external: true, eventPersons: { where: { eventId: id }, select: { id: true } } },
  });
  return NextResponse.json(people.map((p) => ({ id: p.id, name: p.name, dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null, external: p.external, assigned: p.eventPersons.length > 0 })));
}
