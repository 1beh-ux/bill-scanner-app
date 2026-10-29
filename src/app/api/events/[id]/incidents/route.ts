import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { resolveIncidentState, type EffectiveIncident } from "@/lib/incident-state";

// Zdraví -> Aktivní případy (2026-10-29): the event's cases (top-level incidents with their follow-ups).
// ?status=active (default) | resolved | all, ?participantId= one child.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") ?? "active";
  const participantId = sp.get("participantId");

  const rows = await prisma.incident.findMany({
    where: {
      participant: { eventId },
      parentIncidentId: null,
      ...(participantId ? { participantId } : {}),
      ...(status === "active" ? { resolvedAt: null } : status === "resolved" ? { resolvedAt: { not: null } } : {}),
    },
    orderBy: [{ incidentDate: "desc" }, { createdAt: "desc" }],
    include: {
      participant: { select: { name: true, firstName: true, lastName: true, groupName: true } },
      updates: { orderBy: { updatedAt: "asc" } },
      followUps: { orderBy: { createdAt: "asc" }, include: { updates: { orderBy: { updatedAt: "asc" } } } },
    },
  });

  const cases = [];
  for (const r of rows) {
    const effective = resolveIncidentState(r, r.updates);
    if (!effective) continue;
    const followUps = r.followUps.map((f) => resolveIncidentState(f, f.updates)).filter((f): f is EffectiveIncident => !!f);
    cases.push({ ...effective, participant: { id: r.participantId, ...r.participant }, followUps });
  }
  return NextResponse.json(cases);
}
