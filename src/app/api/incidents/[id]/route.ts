import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { resolveIncidentState } from "@/lib/incident-state";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      participant: { select: { eventId: true } },
      updates: { orderBy: { updatedAt: "asc" } },
    },
  });
  if (!incident) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, incident.participant.eventId, "health");
  if (denied) return denied;

  const effective = resolveIncidentState(incident, incident.updates);
  if (!effective) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(effective);
}

// "Vyřešeno" / "Znovu otevřít": PATCH { resolved: boolean } on a case (a top-level incident; its follow-ups
// belong to it). A status only -- the incident's content and correction history stay as they are.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const incident = await prisma.incident.findUnique({
    where: { id },
    include: { participant: { select: { eventId: true } }, updates: { orderBy: { updatedAt: "asc" } } },
  });
  if (!incident || !resolveIncidentState(incident, incident.updates)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = await requireModuleAccess(user, incident.participant.eventId, "health");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (typeof body.resolved !== "boolean") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (incident.parentIncidentId) {
    return NextResponse.json({ error: "follow_up" }, { status: 400 });
  }
  const updated = await prisma.incident.update({
    where: { id },
    data: body.resolved ? { resolvedAt: new Date(), resolvedByUserId: user.id } : { resolvedAt: null, resolvedByUserId: null },
    select: { id: true, resolvedAt: true },
  });
  return NextResponse.json(updated);
}
