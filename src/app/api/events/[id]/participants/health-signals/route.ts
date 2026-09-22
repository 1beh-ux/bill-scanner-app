import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Per-participant health signals for the Zdraví working list (Part 2 of the
 * participants/settings/Health/Mail prompt): a small, purpose-built endpoint
 * rather than adding these to the central roster's GET, since this list is
 * the only reader and the data (incidents, med plans) is health-gated.
 *
 * "unresolved incidents" from the prompt isn't representable -- Incident has
 * no resolved/closed concept anywhere in the schema (see
 * docs/participants-settings-change-notes.md) -- so the indicator is "an
 * incident (or follow-up) logged in the last 24h" only.
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

  const since = new Date(Date.now() - RECENT_WINDOW_MS);
  const [recentIncidents, activeMedPlans] = await Promise.all([
    prisma.incident.findMany({
      where: { participant: { eventId }, createdAt: { gte: since } },
      select: { participantId: true, createdAt: true },
    }),
    prisma.participantMedPlan.findMany({
      where: { participant: { eventId }, active: true },
      select: { participantId: true },
    }),
  ]);

  const incidentCount: Record<string, number> = {};
  const lastIncidentAt: Record<string, string> = {};
  for (const i of recentIncidents) {
    incidentCount[i.participantId] = (incidentCount[i.participantId] ?? 0) + 1;
    const prev = lastIncidentAt[i.participantId];
    if (!prev || i.createdAt.toISOString() > prev) lastIncidentAt[i.participantId] = i.createdAt.toISOString();
  }
  const hasMedPlan = new Set(activeMedPlans.map((p) => p.participantId));

  return NextResponse.json({ incidentCount, lastIncidentAt, medPlanParticipantIds: [...hasMedPlan] });
}
