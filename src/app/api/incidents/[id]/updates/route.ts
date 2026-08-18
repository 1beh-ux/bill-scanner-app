import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requireModuleAccess } from "@/lib/module-access";
import { resolveIncidentState } from "@/lib/incident-state";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id: incidentId } = await params;
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
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

  const current = resolveIncidentState(incident, incident.updates);
  if (!current) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await req.json();
  const updateType: "correct" | "void" = body.updateType === "void" ? "void" : "correct";

  if (updateType === "correct") {
    const { actionSummary, details } = body;
    if (!actionSummary || typeof actionSummary !== "string" || !actionSummary.trim()) {
      return NextResponse.json({ error: "action_summary_required" }, { status: 400 });
    }
    if (!details || typeof details !== "string" || !details.trim()) {
      return NextResponse.json({ error: "details_required" }, { status: 400 });
    }
  }

  // A void carries forward the current snapshot unchanged (schema requires
  // actionSummary/details to be non-null on every update row) -- it's a
  // pure marker via updateType, not a content edit.
  const update = await prisma.incidentUpdate.create({
    data: {
      incidentId,
      updatedByUserId: user.id,
      updateType,
      actionSummary: updateType === "void" ? current.actionSummary : body.actionSummary.trim(),
      pillName: updateType === "void" ? current.pillName : body.pillName || null,
      details: updateType === "void" ? current.details : body.details.trim(),
      photoGcsPath: updateType === "void" ? current.photoGcsPath : body.photoGcsPath || null,
      tempC: updateType === "void" ? current.tempC : body.tempC === "" || body.tempC === undefined ? null : body.tempC,
      bodyView: updateType === "void" ? current.bodyView : body.bodyView || null,
      bodyXPct:
        updateType === "void"
          ? current.bodyXPct
          : body.bodyXPct === "" || body.bodyXPct === undefined
            ? null
            : body.bodyXPct,
      bodyYPct:
        updateType === "void"
          ? current.bodyYPct
          : body.bodyYPct === "" || body.bodyYPct === undefined
            ? null
            : body.bodyYPct,
      note: body.note || null,
    },
  });

  return NextResponse.json(update, { status: 201 });
}
