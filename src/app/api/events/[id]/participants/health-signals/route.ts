import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { resolveIncidentState } from "@/lib/incident-state";

/**
 * Per-participant health signals for the Zdraví working list (Part 2 of the
 * participants/settings/Health/Mail prompt): a small, purpose-built endpoint
 * rather than adding these to the central roster's GET, since this list is
 * the only reader and the data (incidents, med plans) is health-gated.
 *
 * Incidents (2026-10-29): cases = top-level incidents (not voided), counted
 * as active (pink pill) and resolved ("Vyřešeno", grey pill); lastIncidentAt
 * = the newest active case's (or follow-up's) time.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: eventId } = await params;
  const denied = await requireModuleAccess(user, eventId, "health");
  if (denied) return denied;

  const [cases, activeMedPlans] = await Promise.all([
    prisma.incident.findMany({
      where: { participant: { eventId }, parentIncidentId: null },
      include: { updates: { orderBy: { updatedAt: "asc" } }, followUps: { select: { createdAt: true } } },
    }),
    prisma.participantMedPlan.findMany({
      where: { participant: { eventId }, active: true },
      select: { participantId: true, dose: true, notes: true, eventMed: { select: { name: true } }, eventSlot: { select: { name: true, sortOrder: true } } },
      orderBy: [{ eventSlot: { sortOrder: "asc" } }, { eventMed: { name: "asc" } }],
    }),
  ]);

  const incidentCount: Record<string, number> = {};
  const resolvedCount: Record<string, number> = {};
  const lastIncidentAt: Record<string, string> = {};
  for (const i of cases) {
    if (!resolveIncidentState(i, i.updates)) continue;
    if (i.resolvedAt) {
      resolvedCount[i.participantId] = (resolvedCount[i.participantId] ?? 0) + 1;
      continue;
    }
    incidentCount[i.participantId] = (incidentCount[i.participantId] ?? 0) + 1;
    for (const at of [i.createdAt, ...i.followUps.map((f) => f.createdAt)]) {
      const prev = lastIncidentAt[i.participantId];
      if (!prev || at.toISOString() > prev) lastIncidentAt[i.participantId] = at.toISOString();
    }
  }
  const hasMedPlan = new Set(activeMedPlans.map((p) => p.participantId));

  // The plans themselves (2026-10-27): the list shows each time's initials and the detail on a click.
  const medPlans: Record<string, { med: string; slot: string; dose: string | null; notes: string | null }[]> = {};
  for (const p of activeMedPlans) (medPlans[p.participantId] ??= []).push({ med: p.eventMed.name, slot: p.eventSlot.name, dose: p.dose, notes: p.notes });

  return NextResponse.json({ incidentCount, resolvedCount, lastIncidentAt, medPlanParticipantIds: [...hasMedPlan], medPlans });
}
