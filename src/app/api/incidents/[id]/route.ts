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
