import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isOrgAdmin } from "@/lib/org-scope";
import { adultsGuard, createAdult, isoDay } from "@/lib/adults-server";

// Dospělí na akci (src/lib/adults-server.ts). GET = the event's adults; POST { childIds, fromDate?, toDate?, label? }
// assigns adults of Lidé (skipping those already here), or { create: {...} } (organization admins) creates one
// in Lidé and assigns it. Never a Participant, registration, portal token or e-mail.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await adultsGuard(id);
  if ("error" in g) return g.error;
  const rows = await prisma.eventPerson.findMany({
    where: { eventId: id },
    include: { child: { select: { id: true, name: true, firstName: true, lastName: true, dateOfBirth: true, fieldValues: true, allergens: true, dietFlags: true, dietNote: true } } },
  });
  rows.sort((a, b) => (a.child.lastName || a.child.name).localeCompare(b.child.lastName || b.child.name, "cs") || (a.child.firstName ?? "").localeCompare(b.child.firstName ?? "", "cs"));
  return NextResponse.json({
    event: { name: g.event.name, startDate: g.event.startDate.toISOString().slice(0, 10), endDate: g.event.endDate.toISOString().slice(0, 10) },
    canCreate: isOrgAdmin(g.user),
    adults: rows.map((r) => ({
      id: r.id,
      childId: r.childId,
      name: r.child.name,
      dateOfBirth: r.child.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      fieldValues: r.child.fieldValues,
      allergens: r.child.allergens,
      dietFlags: r.child.dietFlags,
      dietNote: r.child.dietNote,
      label: r.label,
      fromDate: r.fromDate?.toISOString().slice(0, 10) ?? null,
      toDate: r.toDate?.toISOString().slice(0, 10) ?? null,
      eats: r.eats,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await adultsGuard(id);
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => ({}))) as { childIds?: unknown; create?: unknown; fromDate?: unknown; toDate?: unknown; label?: unknown };
  let childIds = Array.isArray(body.childIds) ? body.childIds.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  if (body.create !== undefined) {
    // A new person in Lidé: the registry is the organization admins'.
    if (!isOrgAdmin(g.user)) return NextResponse.json({ error: "admin_only" }, { status: 403 });
    const created = await createAdult(g.event.organizationId, body.create);
    if (!created) return NextResponse.json({ error: "name_required" }, { status: 400 });
    childIds = [created.id];
  }
  if (childIds.length === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  // Adults of this organization only: a child or another organization's person is refused.
  const adults = await prisma.child.findMany({ where: { id: { in: childIds }, organizationId: g.event.organizationId }, select: { id: true, isAdult: true } });
  if (adults.length !== new Set(childIds).size) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (adults.some((a) => !a.isAdult)) return NextResponse.json({ error: "not_adult" }, { status: 400 });
  const fromDate = isoDay(body.fromDate);
  const toDate = isoDay(body.toDate);
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) || null : null;
  const r = await prisma.eventPerson.createMany({
    data: adults.map((a) => ({ eventId: id, childId: a.id, label, fromDate: fromDate ? new Date(fromDate) : null, toDate: toDate ? new Date(toDate) : null })),
    skipDuplicates: true,
  });
  return NextResponse.json({ added: r.count }, { status: 201 });
}
